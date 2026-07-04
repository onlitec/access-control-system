"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeCsv = exports.parseSessionAuditSort = exports.parseSessionAuditWhere = exports.SESSION_AUDIT_SORTABLE_COLUMNS = void 0;
exports.SESSION_AUDIT_SORTABLE_COLUMNS = ['createdAt', 'eventType', 'success', 'userEmail', 'ipAddress'];
const parseSessionAuditWhere = (query) => {
    const { userEmail, eventType, success, startTime, endTime, ipAddress, sessionId } = query;
    const where = {};
    const isDefined = (val) => val !== undefined && val !== null && val !== '' && val !== 'undefined';
    if (isDefined(userEmail)) {
        where.userEmail = { contains: userEmail, mode: 'insensitive' };
    }
    if (isDefined(eventType) && eventType !== 'all') {
        where.eventType = eventType;
    }
    if (isDefined(ipAddress)) {
        where.ipAddress = { contains: ipAddress, mode: 'insensitive' };
    }
    if (isDefined(sessionId)) {
        where.sessionId = { contains: sessionId };
    }
    if (success === 'true' || success === 'false') {
        where.success = success === 'true';
    }
    if (isDefined(startTime) || isDefined(endTime)) {
        where.createdAt = {};
        if (isDefined(startTime)) {
            const startDate = new Date(startTime);
            if (Number.isNaN(startDate.getTime())) {
                throw new Error('startTime inválido');
            }
            where.createdAt.gte = startDate;
        }
        if (isDefined(endTime)) {
            const endDate = new Date(endTime);
            if (Number.isNaN(endDate.getTime())) {
                throw new Error('endTime inválido');
            }
            where.createdAt.lte = endDate;
        }
    }
    return where;
};
exports.parseSessionAuditWhere = parseSessionAuditWhere;
const parseSessionAuditSort = (query) => {
    const sortByRaw = query.sortBy || 'createdAt';
    const sortOrderRaw = (query.sortOrder || 'desc').toLowerCase();
    if (!exports.SESSION_AUDIT_SORTABLE_COLUMNS.includes(sortByRaw)) {
        throw new Error(`sortBy inválido. Valores aceitos: ${exports.SESSION_AUDIT_SORTABLE_COLUMNS.join(', ')}`);
    }
    if (sortOrderRaw !== 'asc' && sortOrderRaw !== 'desc') {
        throw new Error('sortOrder inválido. Valores aceitos: asc, desc');
    }
    const sortBy = sortByRaw;
    const sortOrder = sortOrderRaw;
    return { sortBy, sortOrder, orderBy: { [sortBy]: sortOrder } };
};
exports.parseSessionAuditSort = parseSessionAuditSort;
const escapeCsv = (value) => {
    const str = value == null ? '' : String(value);
    return `"${str.replace(/"/g, '""')}"`;
};
exports.escapeCsv = escapeCsv;
