"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikCentralSyncService = void 0;
const client_1 = require("@prisma/client");
const HikCentralService_1 = require("./HikCentralService");
const EventBusService_1 = require("./EventBusService");
const prisma = new client_1.PrismaClient();
// Map real do HikCentral (conforme configurado no Calabasas)
const HIK_ORG_ROLE_MAP = {
    '2': 'MORADOR', // Moradores / Condôminos
    '3': 'PRESTADOR', // Prestadores de serviço
    '4': 'PORTARIA', // Equipe da Portaria (Alias 1)
    '5': 'PORTARIA', // Equipe da Portaria (Alias 2)
    '6': 'ADMIN', // Administração do Condomínio
    '7': 'MORADOR', // Moradores (Alias)
    '8': 'VISITANTE', // Visitantes cadastrados
};
/**
 * Serviço responsável por sincronizar dados do HikCentral Professional para o Banco de Dados Local.
 * Mantém a unicidade baseada no hikPersonId (indexCode).
 */
class HikCentralSyncService {
    /**
     * Sincroniza pessoas de um departamento específico
     */
    static async syncByOrgCode(orgCode, role) {
        console.log(`[Sync] Iniciando sincronização para OrgCode: ${orgCode} (${role || 'N/A'})`);
        let pageNo = 1;
        const pageSize = 500;
        let totalProcessed = 0;
        let hasMore = true;
        while (hasMore) {
            try {
                const result = await HikCentralService_1.HikCentralService.getPersonList({
                    orgIndexCode: orgCode,
                    pageNo,
                    pageSize
                });
                const persons = result?.data?.list || [];
                if (persons.length === 0) {
                    hasMore = false;
                    break;
                }
                for (const p of persons) {
                    const hikPersonId = p.personId || p.indexCode;
                    if (!hikPersonId)
                        continue;
                    await prisma.person.upsert({
                        where: { hikPersonId },
                        update: {
                            firstName: p.personGivenName || p.personName || '',
                            lastName: p.personFamilyName || '',
                            phone: p.phoneNo || p.phone || null,
                            email: p.email || null,
                            orgIndexCode: String(p.orgIndexCode || orgCode),
                            // Se o picUri existir, guardamos para o Proxy de Fotos resolver depois
                            photoUrl: p.personPhoto || null,
                        },
                        create: {
                            hikPersonId,
                            firstName: p.personGivenName || p.personName || '',
                            lastName: p.personFamilyName || '',
                            phone: p.phoneNo || p.phone || null,
                            email: p.email || null,
                            orgIndexCode: String(p.orgIndexCode || orgCode),
                            photoUrl: p.personPhoto || null,
                        }
                    });
                    totalProcessed++;
                }
                console.log(`[Sync] Processadas ${totalProcessed} pessoas (Página ${pageNo})`);
                if (persons.length < pageSize) {
                    hasMore = false;
                }
                else {
                    pageNo++;
                }
            }
            catch (error) {
                console.error(`[Sync] Erro na página ${pageNo} do Org ${orgCode}:`, error.message);
                hasMore = false;
                throw error;
            }
        }
        return totalProcessed;
    }
    /**
     * Sincronização completa de todos os departamentos configurados no mapa
     */
    static async syncAll() {
        const summary = {
            totalSynced: 0,
            departments: {},
            errors: [],
            timestamp: new Date().toISOString()
        };
        const orgCodes = Object.keys(HIK_ORG_ROLE_MAP);
        for (const code of orgCodes) {
            try {
                const role = HIK_ORG_ROLE_MAP[code];
                const count = await this.syncByOrgCode(code, role);
                summary.departments[code] = count;
                summary.totalSynced += count;
            }
            catch (error) {
                summary.errors.push(`Erro no Org ${code}: ${error.message}`);
            }
        }
        return summary;
    }
    /**
     * Sincroniza apenas Moradores (Org 2 e 7)
     */
    static async syncResidents() {
        const count2 = await this.syncByOrgCode('2', 'MORADOR');
        const count7 = await this.syncByOrgCode('7', 'MORADOR');
        return count2 + count7;
    }
    /**
     * Sincroniza logs de acesso recentes do HikCentral e salva no banco de dados local.
     */
    static async syncAccessEvents() {
        try {
            console.log(`[Sync] Iniciando sincronização de Eventos de Acesso...`);
            // Busca eventos das últimas 2 horas (para garantir que não perca nenhum caso o poll atrase)
            const startTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const endTime = new Date().toISOString();
            const result = await HikCentralService_1.HikCentralService.getAccessLogs({
                startTime,
                endTime,
                pageNo: 1,
                pageSize: 1000
            });
            const events = result?.data?.list || [];
            if (events.length === 0)
                return 0;
            let count = 0;
            for (const event of events) {
                // eventId ou indexCode
                const eventId = event.eventId || event.id;
                if (!eventId)
                    continue;
                // Só cria (e faz broadcast SSE) para eventos ainda não sincronizados
                const existing = await prisma.accessEvent.findUnique({ where: { id: eventId }, select: { id: true } });
                if (existing)
                    continue;
                await (0, EventBusService_1.emitEvent)({
                    id: eventId,
                    personName: event.personName || 'Desconhecido',
                    eventTime: new Date(event.eventTime || event.happenTime),
                    occurredAt: new Date(event.eventTime || event.happenTime),
                    deviceName: event.deviceName || event.srcName || 'N/A',
                    doorName: event.doorName || event.srcName || 'N/A',
                    eventType: event.eventType?.toString() || 'ACCESS',
                    picUri: event.picUri || null,
                    photoUrl: event.picUri || null,
                    direction: event.eventType === 'EXIT' ? 'out' : 'in',
                    status: 'authorized', // Default para os que vêm do log como sucesso
                    personType: 'visitor', // Seria ideal fazer o matching com personId para saber se é morador, mas por padrão deixamos visitor
                    category: 'access',
                    source: 'hikcentral',
                });
                count++;
            }
            console.log(`[Sync] Eventos sincronizados: ${count}`);
            return count;
        }
        catch (error) {
            console.error(`[Sync] Falha ao sincronizar eventos: ${error.message}`);
            return 0;
        }
    }
}
exports.HikCentralSyncService = HikCentralSyncService;
