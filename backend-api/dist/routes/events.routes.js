"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsRoutes = void 0;
const express_1 = require("express");
const index_1 = require("../index");
const jsonwebtoken_1 = require("jsonwebtoken");
const EventBusService_1 = require("../services/EventBusService");
const router = (0, express_1.Router)();
// GET /api/events/stream — SSE em tempo real (token via query, EventSource não envia headers)
router.get('/stream', (req, res) => {
    const token = req.query.token;
    if (!token)
        return res.status(401).end();
    try {
        (0, jsonwebtoken_1.verify)(token, process.env.JWT_SECRET || 'secret');
    }
    catch {
        return res.status(401).end();
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: desativa buffering de SSE
    res.flushHeaders();
    const categories = typeof req.query.categories === 'string' && req.query.categories.length > 0
        ? req.query.categories.split(',').map(c => c.trim()).filter(Boolean)
        : undefined;
    const clientId = (0, EventBusService_1.registerEventClient)(res, categories);
    res.write('data: {"type":"connected"}\n\n');
    req.on('close', () => {
        (0, EventBusService_1.unregisterEventClient)(clientId);
    });
});
// GET /api/events
router.get('/', async (req, res) => {
    try {
        const { page = '1', limit = '50', startDate, endDate, personName, personType, deviceName, category, direction, source, status, q } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        // Filtros
        const where = {};
        if (startDate || endDate) {
            where.occurredAt = {};
            if (startDate)
                where.occurredAt.gte = new Date(startDate);
            if (endDate)
                where.occurredAt.lte = new Date(endDate);
        }
        if (personName) {
            where.personName = { contains: personName, mode: 'insensitive' };
        }
        if (personType && personType !== 'all') {
            const types = personType.split(',').map(t => t.trim()).filter(Boolean);
            where.personType = types.length > 1 ? { in: types } : types[0];
        }
        if (deviceName) {
            where.deviceName = { contains: deviceName, mode: 'insensitive' };
        }
        if (category && category !== 'all') {
            where.category = category;
        }
        if (direction) {
            where.direction = direction;
        }
        if (source) {
            where.source = source;
        }
        if (status && status !== 'all') {
            where.status = status;
        }
        if (q) {
            const term = q;
            where.OR = [
                { personName: { contains: term, mode: 'insensitive' } },
                { unit: { contains: term, mode: 'insensitive' } },
                { notes: { contains: term, mode: 'insensitive' } },
                { deviceName: { contains: term, mode: 'insensitive' } },
            ];
        }
        const [total, events] = await Promise.all([
            index_1.prisma.accessEvent.count({ where }),
            index_1.prisma.accessEvent.findMany({
                where,
                orderBy: { occurredAt: 'desc' },
                skip,
                take,
            }),
        ]);
        res.json({
            total,
            page: Number(page),
            limit: take,
            totalPages: Math.ceil(total / take),
            data: events
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Erro ao buscar eventos', details: error.message });
    }
});
exports.eventsRoutes = router;
