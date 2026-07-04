"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationController = void 0;
const BaseController_1 = require("./BaseController");
const HikCentralService_1 = require("../services/HikCentralService");
const db_1 = require("../db");
/**
 * RegistrationController
 *
 * Cadastro centralizado de moradores, funcionários, visitantes e prestadores de serviço.
 * Integra diretamente com o HikCentral via Artemis Gateway (sem acesso direto a IPs).
 * Fluxo: captura biométrica → criação da pessoa (com face embutida) → atribuição de níveis de acesso → persistência local.
 */
class RegistrationController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        /**
         * POST /api/hikcentral/register
         *
         * Body:
         *   personType          - 'resident' | 'employee' | 'visitor' | 'service_provider'
         *   personName          - Nome completo
         *   orgIndexCode        - Código da organização/torre no HikCentral
         *   faceData?           - Base64 JPEG (com ou sem prefixo data-uri — será sanitizado)
         *   accessLevelIndexCodes? - IDs dos níveis de acesso herdados da unidade
         *   phone?              - Telefone
         *   email?              - E-mail
         *   cpf?                - CPF ou outro documento
         *   visitStartTime?     - (visitor) Início da visita (ISO 8601)
         *   visitEndTime?       - (visitor) Fim da visita (ISO 8601)
         *   visitorGroupId?     - (visitor) ID do grupo de visitantes no HikCentral
         *   tower?              - Torre / Bloco
         *   unit?               - Número da unidade / apartamento
         *   notes?              - Observações
         */
        this.register = async (req, res) => {
            try {
                const { personType, personName, orgIndexCode, faceData, accessLevelIndexCodes, phone, email, cpf, visitStartTime, visitEndTime, visitorGroupId, notes, tower, unit, } = req.body;
                if (!personName?.trim()) {
                    return this.error(res, 'personName é obrigatório.', 400);
                }
                if (!orgIndexCode) {
                    return this.error(res, 'orgIndexCode é obrigatório.', 400);
                }
                if (!personType || !['resident', 'employee', 'visitor', 'service_provider'].includes(personType)) {
                    return this.error(res, 'personType inválido. Use: resident, employee, visitor ou service_provider.', 400);
                }
                // 1. Registrar no HikCentral (criação atômica com face embutida no payload)
                const { personId: hikPersonId } = await HikCentralService_1.HikCentralService.registerPersonInHikCentral({
                    personName: personName.trim(),
                    orgIndexCode,
                    faceData,
                    phoneNo: phone,
                    email,
                    certificateNo: cpf,
                    certificateType: cpf ? 111 : undefined,
                });
                // 2. Atribuir níveis de acesso (herança da unidade/torre)
                if (accessLevelIndexCodes && accessLevelIndexCodes.length > 0) {
                    await HikCentralService_1.HikCentralService.assignAccessLevels(hikPersonId, accessLevelIndexCodes);
                }
                // 3. Persistir no banco local de acordo com o tipo de pessoa
                const nameParts = personName.trim().split(' ');
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ');
                let localRecord;
                if (personType === 'resident' || personType === 'employee') {
                    localRecord = await db_1.prisma.person.create({
                        data: {
                            firstName,
                            lastName,
                            phone: phone || null,
                            email: email || null,
                            orgIndexCode,
                            hikPersonId,
                            tower: tower || null,
                            unit_number: unit || null,
                            notes: notes || null,
                            cpf: cpf || null,
                        },
                    });
                }
                else if (personType === 'visitor') {
                    localRecord = await db_1.prisma.visitor.create({
                        data: {
                            name: personName.trim(),
                            phone: phone || null,
                            email: email || null,
                            hikVisitorId: hikPersonId,
                            visitStartTime: visitStartTime ? new Date(visitStartTime) : new Date(),
                            visitEndTime: visitEndTime
                                ? new Date(visitEndTime)
                                : new Date(Date.now() + 24 * 60 * 60 * 1000),
                            tower: tower || null,
                            notes: notes || null,
                            visitorGroupId: visitorGroupId || null,
                            status: 'ACTIVE',
                            type: 'VISITOR',
                        },
                    });
                }
                else if (personType === 'service_provider') {
                    localRecord = await db_1.prisma.serviceProvider.create({
                        data: {
                            fullName: personName.trim(),
                            phone: phone || null,
                            email: email || null,
                            document: cpf || '',
                            serviceType: 'GERAL',
                            providerType: 'temporary',
                            tower: tower || null,
                            notes: notes || null,
                            hikcentralPersonId: hikPersonId,
                        },
                    });
                }
                return this.success(res, {
                    hikPersonId,
                    localId: localRecord?.id,
                    personType,
                    personName: personName.trim(),
                    message: `${personType} cadastrado com sucesso no HikCentral e provisionado aos terminais.`,
                });
            }
            catch (error) {
                console.error('[RegistrationController] register error:', error);
                return this.error(res, error.message);
            }
        };
        /**
         * POST /api/hikcentral/events/subscribe
         *
         * Subscreve o backend para receber notificações push de eventos de acesso do HikCentral.
         * Body (opcional):
         *   callbackUrl?  - URL pública de destino (default: BACKEND_PUBLIC_URL + /api/webhooks/hikcentral)
         *   eventTypes?   - Array de códigos de evento (usa defaults de facial se omitido)
         */
        this.subscribeToEvents = async (req, res) => {
            try {
                const { callbackUrl, eventTypes } = req.body;
                const effectiveCallbackUrl = callbackUrl ||
                    `${process.env.BACKEND_PUBLIC_URL || 'https://localhost:3001'}/api/webhooks/hikcentral`;
                const result = await HikCentralService_1.HikCentralService.subscribeToAccessEvents(effectiveCallbackUrl, eventTypes);
                return this.success(res, {
                    subscribed: result.code === '0' || result.code === 0,
                    callbackUrl: effectiveCallbackUrl,
                    hikResponse: result,
                });
            }
            catch (error) {
                console.error('[RegistrationController] subscribeToEvents error:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.RegistrationController = RegistrationController;
