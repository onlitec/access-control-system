"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIK_VISITOR_STATUS = exports.FALLBACK_ORG_CODES = exports.HIK_ORG_NAMES = exports.HIK_ORG_ROLE_MAP = void 0;
exports.resolveRoleFromOrg = resolveRoleFromOrg;
/**
 * HikCentral Department → Platform Role Mapping
 * Based on real Calabasas departments:
 *   1  = CALABASAS (root - ignored/system)
 *   3  = PRESTADORES
 *   4  = ADMINISTRADORES
 *   5  = PORTARIA
 *   6  = CONDOMINIO
 *   7  = MORADORES
 *   8  = VISITANTES
 */
exports.HIK_ORG_ROLE_MAP = {
    '1': 'SISTEMA', // Root - All Departments
    '2': 'MORADOR', // Residents
    '3': 'PRESTADOR', // Service providers
    '4': 'PORTARIA', // Concierge team
    '5': 'PORTARIA', // Concierge team (alias)
    '6': 'ADMIN', // Condominium Admin
    '7': 'MORADOR', // Residents (alias)
    '8': 'VISITANTE', // Registered visitors
};
/**
 * Human-readable names for HikCentral departments.
 */
exports.HIK_ORG_NAMES = {
    '1': 'ALL DEPARTMENTS',
    '2': 'MORADORES',
    '3': 'PRESTADORES',
    '4': 'PORTARIA',
    '5': 'PORTARIA',
    '6': 'CONDOMINIO',
    '7': 'MORADORES',
    '8': 'VISITANTES',
};
/**
 * Static fallback codes when HikCentral is unreachable.
 */
exports.FALLBACK_ORG_CODES = {
    RESIDENT: ['2', '7'],
    PRESTADOR: ['3'],
    STAFF: ['4', '5', '6'],
    SYSTEM: ['1'],
};
/**
 * HikCentral Appointment Status
 */
exports.HIK_VISITOR_STATUS = {
    SCHEDULED: 0, // Reservation record has been added
    CHECKED_OUT: 1, // Reservation has been invalid
    CHECKED_IN: 2, // Visitor has arrived
};
/**
 * Retorna o role da plataforma baseado no orgIndexCode do HikCentral.
 */
function resolveRoleFromOrg(orgIndexCode) {
    return exports.HIK_ORG_ROLE_MAP[orgIndexCode] || 'DESCONHECIDO';
}
