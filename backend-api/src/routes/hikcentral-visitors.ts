import { Router, Request, Response } from 'express';
import { HikCentralService, VisitorWithStatus } from '../services/HikCentralService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Aplicar authMiddleware a todas as rotas do HikCentral
router.use(authMiddleware);

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
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        console.log(`[HikCentral] /visitantes: ${allVisitors.length} registros`);
        res.json({ data: allVisitors.map(serialize), total: allVisitors.length });
    } catch (error: any) {
        console.error('Erro /visitantes:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

/**
 * GET /api/hikcentral/visitantes-atividade
 * Retorna visitantes com status 2 (Em Atividade)
 */
router.get('/visitantes-atividade', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const active = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_IN);
        console.log(`[HikCentral] /visitantes-atividade: ${active.length} de ${allVisitors.length} registros`);
        res.json({ data: active.map(serialize), total: active.length });
    } catch (error: any) {
        console.error('Erro /visitantes-atividade:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

/**
 * GET /api/hikcentral/visitantes-finalizados
 * Retorna visitantes com status 1 (Finalizado/Saiu)
 */
router.get('/visitantes-finalizados', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES || 'VISITANTES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const finished = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_OUT);
        console.log(`[HikCentral] /visitantes-finalizados: ${finished.length} de ${allVisitors.length} registros`);
        res.json({ data: finished.map(serialize), total: finished.length });
    } catch (error: any) {
        console.error('Erro /visitantes-finalizados:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

// ============ ENDPOINTS DE PRESTADORES (Módulo Visitor - Grupo PRESTADORES) ============

/**
 * GET /api/hikcentral/prestadores
 * Retorna TODOS os prestadores do grupo PRESTADORES (todos os status).
 * São prestadores cadastrados pelos moradores no módulo de visitantes.
 */
router.get('/prestadores', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        const allProviders = await HikCentralService.fetchVisitorsWithStatus(groupName);
        console.log(`[HikCentral] /prestadores: ${allProviders.length} registros`);
        res.json({ data: allProviders.map(serialize), total: allProviders.length });
    } catch (error: any) {
        console.error('Erro /prestadores:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

/**
 * GET /api/hikcentral/prestadores-atividade
 * Retorna prestadores com status 2 (Em Atividade)
 */
router.get('/prestadores-atividade', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const active = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_IN);
        console.log(`[HikCentral] /prestadores-atividade: ${active.length} de ${allVisitors.length} registros`);
        res.json({ data: active.map(serialize), total: active.length });
    } catch (error: any) {
        console.error('Erro /prestadores-atividade:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

/**
 * GET /api/hikcentral/prestadores-finalizados
 * Retorna prestadores com status 1 (Finalizado/Saiu)
 */
router.get('/prestadores-finalizados', async (req: Request, res: Response) => {
    try {
        const groupName = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES || 'PRESTADORES';
        const allVisitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
        const finished = allVisitors.filter(v => v.appointStatus === STATUS.CHECKED_OUT);
        console.log(`[HikCentral] /prestadores-finalizados: ${finished.length} de ${allVisitors.length} registros`);
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
    try {
        // orgIndexCode 3 = PRESTADORES (departamento permanente do condomínio)
        const prestadoresOrgCode = process.env.HIK_PRESTADORES_ORG_CODE || '3';

        const result = await HikCentralService.getPersonsByDepartment(prestadoresOrgCode);
        console.log(`[HikCentral] /internal-providers: ${result.length} prestadores internos`);

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
        // Mesmo em erro crítico, tentamos retornar o fallback para não quebrar o frontend
        res.json({ options: ['TORRE - PERFECTO', 'TORRE - NOBILE', 'TORRE - DESEO', 'TORRE - PARAÍSO'] });
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
