import { Router, Request, Response } from 'express';
import { HikCentralService } from '../services/HikCentralService';

const router = Router();

// ============ Cache para IDs de grupos ============
const GROUP_ID_CACHE: Record<string, { id: string; timestamp: number }> = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

/**
 * Normaliza string para comparação case-insensitive com acentos
 */
const normalize = (value: string): string =>
    value
        .trim()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

/**
 * Obtém o ID do grupo de visitantes com cache
 */
async function getGroupIdCached(groupName: string): Promise<string> {
    const normalized = normalize(groupName);
    const cached = GROUP_ID_CACHE[normalized];
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        console.log(`[HikCentral] Cache hit para grupo \"${groupName}\": ID=${cached.id}`);
        return cached.id;
    }
    
    console.log(`[HikCentral] Cache miss para grupo \"${groupName}\", buscando na API...`);
    const id = await HikCentralService.getVisitorGroupIdByName(groupName);
    GROUP_ID_CACHE[normalized] = { id, timestamp: Date.now() };
    console.log(`[HikCentral] Grupo \"${groupName}\" cacheado com ID=${id}`);
    return id;
}

/**
 * Calcula data ISO 8601 para um período no passado
 */
function getDateISO(daysAgo: number): string {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    // Formato ISO 8601 com timezone +00:00 (exigido pelo HikCentral)
    return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/**
 * Status de agendamento do HikCentral:
 * 0 = Agendado (Reservation record has been added)
 * 1 = Encerrado/Check-out (Reservation has been invalid)
 * 2 = Check-in realizado (Visitor has arrived)
 */
const APPOINTMENT_STATUS = {
    SCHEDULED: 0,
    CHECKED_OUT: 1,
    CHECKED_IN: 2,
} as const;

/**
 * Busca TODOS os appointments de um grupo com paginação completa
 * Janela de 60 dias para garantir que prestadores antigos apareçam
 */
async function getAllAppointmentsForGroup(
    groupName: string,
    options: { daysWindow?: number; pageSize?: number } = {}
): Promise<{
    groupId: string;
    appointments: any[];
    total: number;
}> {
    const daysWindow = options.daysWindow || 60;
    const pageSize = options.pageSize || 500;
    
    try {
        const groupId = await getGroupIdCached(groupName);
        const now = new Date();
        const startTime = getDateISO(daysWindow);
        const endTime = now.toISOString().replace(/\.\d{3}Z$/, '+00:00');
        
        console.log(`[HikCentral] Buscando appointments para grupo \"${groupName}\" (ID: ${groupId})`);
        console.log(`[HikCentral] Período: ${startTime} até ${endTime}`);
        
        const allAppointments: any[] = [];
        let pageNo = 1;
        let total = Number.POSITIVE_INFINITY;
        
        while (allAppointments.length < total) {
            const result = await HikCentralService.getAppointmentList({
                pageNo,
                pageSize,
                appointStartTime: startTime,
                appointEndTime: endTime,
                appointState: '', // Vazio para buscar todos os status
            });
            
            const list = result?.data?.list || [];
            const pageTotal = Number(result?.data?.total) || 0;
            
            if (Number.isFinite(pageTotal)) {
                total = pageTotal;
            }
            
            if (!Array.isArray(list) || list.length === 0) {
                break;
            }
            
            // Filtra apenas appointments do grupo específico
            const filtered = list.filter((apt: any) => {
                const aptGroupId = String(apt?.visitorGroupId || apt?.visitorGroupID || '');
                return aptGroupId === groupId;
            });
            
            allAppointments.push(...filtered);
            
            if (list.length < pageSize) {
                break;
            }
            pageNo++;
        }
        
        console.log(`[HikCentral] Total de appointments encontrados para \"${groupName}\": ${allAppointments.length}`);
        
        return {
            groupId,
            appointments: allAppointments,
            total: allAppointments.length,
        };
    } catch (error: any) {
        console.error(`[HikCentral] Erro ao buscar appointments para \"${groupName}\":`, error.message);
        return {
            groupId: '',
            appointments: [],
            total: 0,
        };
    }
}

/**
 * Classifica appointments em Ativos e Finalizados
 * 
 * LÓGICA:
 * - Ativos: status 2 (check-in) ou status 0 (agendado)
 * - Finalizados: status 1 (check-out) OU visitEndTime expirado
 * - FALLBACK: status não mapeado → finalizados (nunca some!)
 */
function classifyAppointments(appointments: any[]): {
    active: any[];
    finished: any[];
    unmapped: any[];
} {
    const active: any[] = [];
    const finished: any[] = [];
    const unmapped: any[] = [];
    
    const now = new Date();
    
    for (const apt of appointments) {
        const status = apt?.appointStatus ?? apt?.appointState ?? apt?.status;
        const visitEndTime = apt?.visitEndTime ? new Date(apt.visitEndTime) : null;
        const isExpired = visitEndTime && visitEndTime < now;
        
        // Status 2 = Check-in realizado (está no condomínio)
        if (status === APPOINTMENT_STATUS.CHECKED_IN) {
            active.push(apt);
        }
        // Status 0 = Agendado (pode estar aguardando entrada)
        else if (status === APPOINTMENT_STATUS.SCHEDULED) {
            // Se expirou, vai para finalizados
            if (isExpired) {
                finished.push(apt);
            } else {
                active.push(apt);
            }
        }
        // Status 1 = Check-out realizado (saiu do condomínio)
        else if (status === APPOINTMENT_STATUS.CHECKED_OUT) {
            finished.push(apt);
        }
        // FALLBACK: Status não mapeado → joga em finalizados para não \"sumir\"
        else {
            console.warn('[HikCentral] Status não mapeado encontrado:', {
                visitorName: apt?.visitorName,
                appointStatus: status,
                visitorId: apt?.visitorId,
            });
            unmapped.push(apt);
            // IMPORTANTE: Nunca deixa o prestador \"sumir\" - joga em finalizados
            finished.push(apt);
        }
    }
    
    return { active, finished, unmapped };
}

/**
 * Serializa appointment para resposta da API
 */
function serializeAppointment(apt: any) {
    return {
        id: apt?.visitorId || apt?.id || apt?.indexCode,
        visitor_id: apt?.visitorId,
        visitor_name: apt?.visitorName || apt?.personName,
        visitor_group_id: apt?.visitorGroupId || apt?.visitorGroupID,
        visitor_group_name: apt?.visitorGroupName,
        certificate_no: apt?.certificateNo || apt?.identifyCode,
        phone_no: apt?.phoneNo || apt?.phoneNum,
        plate_no: apt?.plateNo,
        visit_start_time: apt?.visitStartTime,
        visit_end_time: apt?.visitEndTime,
        appoint_status: apt?.appointStatus ?? apt?.appointState,
        appoint_status_label: getStatusLabel(apt?.appointStatus ?? apt?.appointState),
        created_time: apt?.createTime || apt?.createdTime,
        org_name: apt?.orgName,
        person_id: apt?.personId,
    };
}

function getStatusLabel(status: number | undefined): string {
    switch (status) {
        case 0: return 'Agendado';
        case 1: return 'Finalizado';
        case 2: return 'No Condomínio';
        default: return 'Desconhecido';
    }
}

// ============ ENDPOINTS ============

/**
 * GET /api/hikcentral/prestadores-atividade
 * Lista prestadores que estão atualmente no condomínio (status 2 ou 0 não expirado)
 */
router.get('/prestadores-atividade', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        
        const { appointments } = await getAllAppointmentsForGroup(groupName, {
            daysWindow: 60,
            pageSize: 500,
        });
        
        const { active } = classifyAppointments(appointments);
        
        console.log(`[HikCentral] Prestadores ativos encontrados: ${active.length}`);
        
        res.json({
            data: active.map(serializeAppointment),
            total: active.length,
            group: groupName,
            status: 'active',
        });
    } catch (error: any) {
        console.error('[HikCentral] Erro ao buscar prestadores ativos:', error);
        res.status(500).json({ 
            error: error.message || 'Erro ao buscar prestadores ativos',
            data: [],
            total: 0,
        });
    }
});

/**
 * GET /api/hikcentral/prestadores-finalizados
 * Lista prestadores que já saíram do condomínio (status 1 ou expirados)
 */
router.get('/prestadores-finalizados', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        
        const { appointments } = await getAllAppointmentsForGroup(groupName, {
            daysWindow: 60,
            pageSize: 500,
        });
        
        const { finished, unmapped } = classifyAppointments(appointments);
        
        console.log(`[HikCentral] Prestadores finalizados: ${finished.length} (incluindo ${unmapped.length} não mapeados)`);
        
        res.json({
            data: finished.map(serializeAppointment),
            total: finished.length,
            group: groupName,
            status: 'finished',
            unmapped_count: unmapped.length,
        });
    } catch (error: any) {
        console.error('[HikCentral] Erro ao buscar prestadores finalizados:', error);
        res.status(500).json({ 
            error: error.message || 'Erro ao buscar prestadores finalizados',
            data: [],
            total: 0,
        });
    }
});

/**
 * GET /api/hikcentral/visitantes-atividade
 * Lista visitantes que estão atualmente no condomínio
 */
router.get('/visitantes-atividade', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        
        const { appointments } = await getAllAppointmentsForGroup(groupName, {
            daysWindow: 30, // Visitantes usam janela menor
            pageSize: 500,
        });
        
        const { active } = classifyAppointments(appointments);
        
        console.log(`[HikCentral] Visitantes ativos encontrados: ${active.length}`);
        
        res.json({
            data: active.map(serializeAppointment),
            total: active.length,
            group: groupName,
            status: 'active',
        });
    } catch (error: any) {
        console.error('[HikCentral] Erro ao buscar visitantes ativos:', error);
        res.status(500).json({ 
            error: error.message || 'Erro ao buscar visitantes ativos',
            data: [],
            total: 0,
        });
    }
});

/**
 * GET /api/hikcentral/visitantes-finalizados
 * Lista visitantes que já saíram do condomínio
 */
router.get('/visitantes-finalizados', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        
        const { appointments } = await getAllAppointmentsForGroup(groupName, {
            daysWindow: 30,
            pageSize: 500,
        });
        
        const { finished, unmapped } = classifyAppointments(appointments);
        
        console.log(`[HikCentral] Visitantes finalizados: ${finished.length} (incluindo ${unmapped.length} não mapeados)`);
        
        
        res.json({
            data: finished.map(serializeAppointment),
            total: finished.length,
            group: groupName,
            status: 'finished',
            unmapped_count: unmapped.length,
        });
    } catch (error: any) {
        console.error('[HikCentral] Erro ao buscar visitantes finalizados:', error);
        res.status(500).json({ 
            error: error.message || 'Erro ao buscar visitantes finalizados',
            data: [],
            total: 0,
        });
    }
});

/**
 * GET /api/hikcentral/appointments
 * Endpoint genérico para buscar appointments com filtros
 */
router.get('/appointments', async (req: Request, res: Response) => {
    try {
        const { 
            group = 'PRESTADORES', 
            status = '',
            days = '60',
            page = '1',
            limit = '100'
        } = req.query;
        
        const daysWindow = Math.min(365, Math.max(1, parseInt(days as string, 10) || 60));
        const pageSize = Math.min(500, Math.max(10, parseInt(limit as string, 10) || 100));
        
        const { groupId, appointments, total } = await getAllAppointmentsForGroup(group as string, {
            daysWindow,
            pageSize,
        });
        
        // Filtra por status se especificado
        let filtered = appointments;
        if (status !== '') {
            const statusNum = parseInt(status as string, 10);
            if (!Number.isNaN(statusNum)) {
                filtered = appointments.filter((apt: any) => 
                    (apt?.appointStatus ?? apt?.appointState) === statusNum
                );
            }
        }
        
        // Paginação
        const pageNum = parseInt(page as string, 10) || 1;
        const skip = (pageNum - 1) * pageSize;
        const paginated = filtered.slice(skip, skip + pageSize);
        
        res.json({
            data: paginated.map(serializeAppointment),
            total: filtered.length,
            page: pageNum,
            limit: pageSize,
            group_id: groupId,
            group_name: group,
            days_window: daysWindow,
        });
    } catch (error: any) {
        console.error('[HikCentral] Erro ao buscar appointments:', error);
        res.status(500).json({ 
            error: error.message || 'Erro ao buscar appointments',
            data: [],
            total: 0,
        });
    }
});

/**
 * POST /api/hikcentral/cache/clear
 * Limpa o cache de IDs de grupos (útil para testes)
 */
router.post('/cache/clear', (req: Request, res: Response) => {
    Object.keys(GROUP_ID_CACHE).forEach(key => delete GROUP_ID_CACHE[key]);
    HikCentralService.clearVisitorGroupCache();
    res.json({ message: 'Cache limpo com sucesso' });
});

export default router;