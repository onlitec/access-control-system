import { Router, Request, Response } from 'express';
import { HikCentralService, VisitorWithStatus } from '../services/HikCentralService';

const router = Router();

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
router.get('/calabasas-providers', async (req: Request, res: Response) => {
    try {
        // orgIndexCode 3 = PRESTADORES (departamento permanente do condomínio)
        const prestadoresOrgCode = process.env.HIK_PRESTADORES_ORG_CODE || '3';

        const result = await HikCentralService.getPersonsByDepartment(prestadoresOrgCode);
        console.log(`[HikCentral] /calabasas-providers: ${result.length} prestadores Calabasas`);

        res.json({ data: result, total: result.length });
    } catch (error: any) {
        console.error('Erro /calabasas-providers:', error);
        res.status(500).json({ error: error.message, data: [] });
    }
});

export default router;
