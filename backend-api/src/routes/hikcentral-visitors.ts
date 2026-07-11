import { Router, Request, Response } from 'express';
import { HikCentralService, VisitorWithStatus } from '../services/HikCentralService';
import { authMiddleware } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Aplicar authMiddleware a todas as rotas do HikCentral
router.use(authMiddleware);

/** Returns true only when PROVIDER_TYPE is explicitly set to hikcentral */
const isHikCentralConfigured = () =>
    (process.env.PROVIDER_TYPE ?? 'local').toLowerCase() === 'hikcentral' &&
    !!process.env.HIKCENTRAL_IP_BASE;

/**
 * Deriva o status efetivo de um visitante local combinando o campo `status`
 * com a janela de tempo da visita (o campo `status` fica 'ACTIVE' por default
 * e não é atualizado no checkout — a janela de tempo é a fonte de verdade,
 * mesma lógica usada pelos contadores da dashboard).
 */
const localEffectiveStatus = (v: any): { code: number; text: string } => {
    const now = new Date();
    const start = v.visitStartTime ? new Date(v.visitStartTime) : null;
    const end = v.visitEndTime ? new Date(v.visitEndTime) : null;
    if (v.status === 'FINISHED' || (end && end < now)) return { code: 1, text: 'FINISHED' };
    if (start && start <= now) return { code: 2, text: 'ACTIVE' };
    return { code: 0, text: 'SCHEDULED' };
};

const serializeLocalVisitor = (v: any) => {
    const eff = localEffectiveStatus(v);
    return {
        id: v.id,
        visitor_id: v.id,
        visitor_name: v.full_name || `${v.name || ''} ${v.surname || ''}`.trim() || 'Sem nome',
        visitor_group_name: v.purpose || 'Visita',
        plate_no: v.plateNo || '',
        certificate_no: v.certificateNo || v.document || '',
        phone_num: v.phone || '',
        appoint_status: eff.code,
        appoint_status_text: eff.text,
        appoint_start_time: v.visitStartTime?.toISOString?.() || v.visitStartTime || null,
        appoint_end_time: v.visitEndTime?.toISOString?.() || v.visitEndTime || null,
        visit_start_time: null,
        visit_end_time: null,
        // Pass through rich local fields so the page can show them directly
        visiting_unit: v.visiting_unit || null,
        visiting_block: v.visiting_block || null,
        tower: v.tower || null,
        notes: v.notes || null,
        photo_url: v.photo_url || null,
    };
};

const serializeLocalProvider = (p: any) => {
    const now = new Date();
    const until = p.validUntil ? new Date(p.validUntil) : null;
    const status = until && until < now ? 1 : 2; // expired → checked-out, otherwise checked-in
    return {
        id: p.id,
        visitor_id: p.id,
        visitor_name: p.fullName || 'Sem nome',
        visitor_group_name: p.serviceType || 'Prestador',
        plate_no: '',
        certificate_no: p.document || '',
        phone_num: p.phone || '',
        appoint_status: status,
        appoint_status_text: status === 1 ? 'FINISHED' : 'ACTIVE',
        appoint_start_time: p.validFrom || p.createdAt?.toISOString?.() || null,
        appoint_end_time: p.validUntil || null,
        visit_start_time: null,
        visit_end_time: null,
        visiting_unit: p.visitingUnit || null,
        visiting_block: p.visitingBlock || null,
        tower: p.tower || null,
        notes: p.notes || null,
        photo_url: p.photoUrl || null,
        hikcentral_person_id: p.hikcentralPersonId || null,
    };
};

// ============ CONSTANTES ============

/**
 * Status de agendamento do HikCentral:
 * 0 = Agendado (Reservation record has been added)
 * 1 = Encerrado/Check-out (Reservation has been invalid)
 * 2 = Check-in realizado (Visitor has arrived)
 */
const STATUS = {
    SCHEDULED: 0,
    CHECKED_OUT: 1,
    CHECKED_IN: 2,
};

// ============ SERIALIZADOR PARA FRONTEND ============

/**
 * Serializa VisitorWithStatus para o formato esperado pelo frontend.
 */
const serialize = (item: VisitorWithStatus) => ({
    id: item.appointmentId || item.visitorId,
    visitor_id: item.visitorId,
    visitor_name: item.visitorName,
    visitor_group_name: item.visitorGroupName,
    plate_no: item.plateNo || '',
    certificate_no: item.certificateNo || '',
    phone_num: item.phoneNum || '',
    appoint_status: item.appointStatus,
    appoint_status_text: item.appointStatusText,
    appoint_start_time: item.appointStartTime,
    appoint_end_time: item.appointEndTime,
    visit_start_time: item.visitStartTime || null,
    visit_end_time: item.visitEndTime || null,
});

// ============ ENDPOINTS DE VISITANTES (Módulo Visitor - Grupo VISITANTES) ============

/**
 * GET /api/hikcentral/visitantes
 * Retorna TODOS os visitantes do grupo VISITANTES (todos os status).
 * São visitantes cadastrados pelos moradores.
 */
router.get('/visitantes', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const rows = await prisma.visitor.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
        const data = rows.map(serializeLocalVisitor);
        return res.json({ data, total: data.length });
    }
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        res.json({ data: allVisitors.map(serialize), total: allVisitors.length });
    } catch (error: any) {
        console.error('Erro /visitantes:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

router.get('/visitantes-atividade', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const rows = await prisma.visitor.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
        const data = rows.map(serializeLocalVisitor).filter(v => v.appoint_status === STATUS.CHECKED_IN);
        return res.json({ data, total: data.length });
    }
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const active = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_IN);
        res.json({ data: active.map(serialize), total: active.length });
    } catch (error: any) {
        console.error('Erro /visitantes-atividade:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

router.get('/visitantes-finalizados', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const rows = await prisma.visitor.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
        const data = rows.map(serializeLocalVisitor).filter(v => v.appoint_status === STATUS.CHECKED_OUT);
        return res.json({ data, total: data.length });
    }
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const finished = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_OUT);
        res.json({ data: finished.map(serialize), total: finished.length });
    } catch (error: any) {
        console.error('Erro /visitantes-finalizados:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

// ============ ENDPOINTS DE PRESTADORES (Módulo Visitor - Grupo PRESTADORES) ============

router.get('/prestadores', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const rows = await prisma.serviceProvider.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
        const data = rows.map(serializeLocalProvider);
        return res.json({ data, total: data.length });
    }
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        const allProviders = await HikCentralService.fetchVisitorsWithStatus(groupName);
        res.json({ data: allProviders.map(serialize), total: allProviders.length });
    } catch (error: any) {
        console.error('Erro /prestadores:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

router.get('/prestadores-atividade', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const now = new Date().toISOString().split('T')[0];
        const rows = await prisma.serviceProvider.findMany({
            where: { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
            orderBy: { createdAt: 'desc' }, take: 500
        });
        const data = rows.map(serializeLocalProvider).filter(p => p.appoint_status === 2);
        return res.json({ data, total: data.length });
    }
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const active = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_IN);
        res.json({ data: active.map(serialize), total: active.length });
    } catch (error: any) {
        console.error('Erro /prestadores-atividade:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

router.get('/prestadores-finalizados', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const now = new Date().toISOString().split('T')[0];
        const rows = await prisma.serviceProvider.findMany({
            where: { validUntil: { lt: now } },
            orderBy: { createdAt: 'desc' }, take: 500
        });
        const data = rows.map(serializeLocalProvider);
        return res.json({ data, total: data.length });
    }
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const finished = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_OUT);
        res.json({ data: finished.map(serialize), total: finished.length });
    } catch (error: any) {
        console.error('Erro /prestadores-finalizados:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

// ============ ENDPOINTS PRESTADORES CALABASAS (Módulo ACS/Pessoas - Departamento PRESTADORES) ============

/**
 * GET /api/hikcentral/calabasas-providers
 * Retorna pessoas cadastradas no DEPARTAMENTO "PRESTADORES" (orgIndexCode 3).
 * Estes são prestadores permanentes do condomínio, cadastrados no módulo de pessoas
 * (não no módulo de visitantes). Têm acesso recorrente, não por agendamento.
 */
router.get('/internal-providers', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        const rows = await prisma.serviceProvider.findMany({ where: { providerType: 'permanent' }, orderBy: { createdAt: 'desc' }, take: 500 });
        return res.json({ data: rows.map(serializeLocalProvider), total: rows.length });
    }
    try {
        const prestadoresOrgCode = process.env.HIK_PRESTADORES_ORG_CODE || '3';
        const result = await HikCentralService.getPersonsByDepartment(prestadoresOrgCode);
        res.json({ data: result, total: result.length });
    } catch (error: any) {
        console.error('Erro /internal-providers:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

/**
 * GET /api/hikcentral/terminals
 * Retorna lista de terminais (dispositivos ACS) do HikCentral.
 */
router.get('/terminals', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        // Standalone: sem terminais externos — captura usa os videoporteiros locais
        return res.json({ data: [], total: 0 });
    }
    try {
        const { type = 'acs' } = req.query;
        console.log(`[HikCentral] Buscando terminais (tipo: ${type})...`);

        let result;
        if (type === 'acs') {
            result = await HikCentralService.getAcsDeviceList(1, 100);
        } else {
            // Fallback para câmeras se solicitado vídeo
            result = await HikCentralService.hikRequest('/artemis/api/resource/v1/cameras', {
                method: 'POST',
                body: JSON.stringify({ pageNo: 1, pageSize: 100 })
            });
        }

        const list = result?.data?.list || [];
        const formatted = list.map((d: any) => ({
            id: d.acsDevIndexCode || d.cameraIndexCode || d.indexCode,
            name: d.acsDevName || d.cameraName || d.name,
            status: d.status === 1 ? 'online' : 'offline',
            type: type
        }));

        res.json({ data: formatted, total: formatted.length });
    } catch (error: any) {
        console.error('[HikCentral] Erro em /terminals:', error.message);
        res.status(500).json({ error: 'Falha ao buscar terminais', details: error.message });
    }
});

// ============ REMOTE CAPTURE ============

/**
 * GET /api/hikcentral/person-properties
 * Retorna as opções de campos customizados (ex: Torres) para o frontend.
 */
router.get('/person-properties', async (req: Request, res: Response) => {
    try {
        // Fallback rígido garantido conforme requisito
        const defaultOptions = ['TORRE - PERFECTO', 'TORRE - NOBILE', 'TORRE - DESEO', 'TORRE - PARAÍSO'];

        // Standalone: sem HikCentral, responde direto o fallback local
        if (!isHikCentralConfigured()) return res.json({ options: defaultOptions });

        try {
            // Tentativa de buscar os campos customizados do HikCentral (Artemis OpenAPI)
            console.log('[HikCentral] Buscando campos customizados (/artemis/api/resource/v1/person/customData/list)...');
            const result = await HikCentralService.hikRequest('/artemis/api/resource/v1/person/customData/list', {
                method: 'POST', 
                body: JSON.stringify({})
            });

            // Se o HikCentral retornar sucesso, processamos a lista
            if (result && result.data && Array.isArray(result.data)) {
                const customFields = result.data;
                const torreField = customFields.find((f: any) => 
                    (f.name || '').toUpperCase() === 'TORRE' || 
                    (f.customFieldName || '').toUpperCase() === 'TORRE' || 
                    (f.title || '').toUpperCase() === 'TORRE'
                );

                if (torreField && (torreField.options || torreField.selectOptions)) {
                    const options = torreField.options || torreField.selectOptions;
                    if (Array.isArray(options) && options.length > 0) {
                        console.log(`[HikCentral] Opções de 'Torre' carregadas dinamicamente: ${options.length}`);
                        return res.json({ options });
                    }
                }
            }
            console.log('[HikCentral] Campo "Torre" não encontrado ou sem opções na API, usando fallback.');
        } catch (apiErr: any) {
            console.warn('[HikCentral] Falha ao buscar person-properties dinamicamente:', apiErr.message);
        }

        // Retorna fallback se a API falhar ou não tiver os dados
        res.json({ options: defaultOptions });

    } catch (error: any) {
        console.error('[HikCentral] Erro crítico em /person-properties:', error.message);
        res.json({ options: ['TORRE - PERFECTO', 'TORRE - NOBILE', 'TORRE - DESEO', 'TORRE - PARAÍSO'] });
    }
});

// ============ ORGANIZATIONS / ACCESS LEVELS / RESIDENTS SYNC ============

router.get('/organizations', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) return res.json({ code: '0', msg: 'unavailable', data: { list: [] } });
    try {
        const result = await HikCentralService.getOrgList(1, 500);
        return res.json({ code: '0', msg: 'success', data: { list: result?.data?.list || [] } });
    } catch {
        return res.json({ code: '0', msg: 'unavailable', data: { list: [] } });
    }
});

router.get('/access-levels', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) return res.json({ success: true, data: { list: [] } });
    try {
        const result = await HikCentralService.getAccessLevelList(1, 200);
        return res.json({ success: true, data: { list: result?.data?.list || [] } });
    } catch {
        return res.json({ success: true, data: { list: [] } });
    }
});

router.post('/residents/sync', async (req: Request, res: Response) => {
    if (!isHikCentralConfigured()) {
        return res.json({ success: true, count: 0, message: 'Sistema standalone: dados 100% locais, nada a sincronizar' });
    }
    try {
        const orgs = await HikCentralService.getOrgList(1, 500);
        const orgList: any[] = orgs?.data?.list || [];
        let total = 0;
        for (const org of orgList) {
            const persons = await HikCentralService.getPersonList({ orgIndexCode: org.orgIndexCode, pageNo: 1, pageSize: 1000 });
            total += persons?.data?.list?.length || 0;
        }
        return res.json({ success: true, count: total });
    } catch {
        return res.json({ success: false, count: 0, message: 'HikCentral não configurado ou indisponível' });
    }
});

// ============ REMOTE CAPTURE ============

/**
 * POST /api/hikcentral/remote-capture
 * Aciona a captura remota de imagem em um dispositivo/câmera.
 */
router.post('/remote-capture', async (req: Request, res: Response) => {
    try {
        const { deviceIndexCode } = req.body;

        if (!deviceIndexCode) {
            return res.status(400).json({ error: 'deviceIndexCode é obrigatório' });
        }

        if (!isHikCentralConfigured()) {
            return res.status(400).json({ error: 'Sistema standalone: captura remota usa os videoporteiros locais (/api/doorbell)' });
        }

        console.log(`[Remote Capture] Requisição recebida para dispositivo: ${deviceIndexCode}`);

        // 1. Tentar resolver o código da câmera associada (se houver)
        // Muitas vezes o terminal de acesso tem uma câmera vinculada com outro ID
        let targetIndexCode = deviceIndexCode;
        try {
            const resolved = await HikCentralService.resolveCameraIndexCodeByDeviceId(deviceIndexCode);
            if (resolved) {
                targetIndexCode = resolved;
                console.log(`[Remote Capture] Dispositivo ${deviceIndexCode} resolvido para câmera ${targetIndexCode}`);
            }
        } catch (resolveErr) {
            console.warn(`[Remote Capture] Falha na resolução de câmera (usando original):`, resolveErr);
        }

        // 2. Realizar a captura
        const imageBuffer = await HikCentralService.captureCameraPicture(targetIndexCode);

        // 3. Retornar a imagem
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Length', imageBuffer.length.toString());
        res.send(imageBuffer);

    } catch (error: any) {
        console.error('[Remote Capture] Erro:', error.message);
        // Retornar 500 com detalhes JSON para o frontend tratar
        res.status(500).json({ 
            error: 'Falha ao capturar imagem do dispositivo', 
            details: error.message,
            deviceIndexCode: req.body.deviceIndexCode
        });
    }
});

export default router;
