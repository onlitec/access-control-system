"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_ORG_CODES = exports.STAFF_ORG_CODES_FALLBACK = exports.PRESTADORES_ORG_CODES_FALLBACK = exports.RESIDENT_ORG_CODES_FALLBACK = exports.HIK_ORG_NAMES = exports.HIK_ORG_ROLE_MAP = void 0;
exports.resolveRoleFromOrg = resolveRoleFromOrg;
exports.HIK_ORG_ROLE_MAP = {
    '1': 'SISTEMA', // All Departments
    '2': 'MORADOR', // MORADORES
    '3': 'SISTEMA', // CONDOMINIO (child of 5)
    '4': 'PORTARIA', // PORTARIA (child of 5)
    '5': 'SISTEMA', // FUNCIONÁRIOS
    '6': 'SISTEMA', // PISCINA
    '7': 'ADMIN', // ADMINISTRADORES (child of 5)
    '8': 'VISITANTE', // Internal mapping for visitors
};
exports.HIK_ORG_NAMES = {
    '1': 'ALL DEPARTMENTS',
    '2': 'MORADORES',
    '3': 'CONDOMINIO',
    '4': 'PORTARIA',
    '5': 'FUNCIONÁRIOS',
    '6': 'PISCINA',
    '7': 'ADMINISTRADORES',
};
function resolveRoleFromOrg(orgIndexCode) {
    return exports.HIK_ORG_ROLE_MAP[orgIndexCode] || 'DESCONHECIDO';
}
exports.RESIDENT_ORG_CODES_FALLBACK = ['2', '7'];
exports.PRESTADORES_ORG_CODES_FALLBACK = ['3'];
exports.STAFF_ORG_CODES_FALLBACK = ['4', '5', '6'];
exports.SYSTEM_ORG_CODES = ['1'];
