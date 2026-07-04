import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { Prisma } from '@prisma/client';
import { verify } from 'jsonwebtoken';
import { config } from '../config/unifiedConfig';
import { authMiddleware } from '../middleware/auth';
import { registerEventClient, unregisterEventClient } from '../services/EventBusService';

const router = Router();

// GET /api/events/stream — SSE em tempo real (token via query, EventSource não envia headers)
router.get('/stream', (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) return res.status(401).end();

  try {
    verify(token, config.JWT.SECRET);
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: desativa buffering de SSE
  res.flushHeaders();

  const categories = typeof req.query.categories === 'string' && req.query.categories.length > 0
    ? (req.query.categories as string).split(',').map(c => c.trim()).filter(Boolean)
    : undefined;

  const clientId = registerEventClient(res, categories);
  res.write('data: {"type":"connected"}\n\n');

  req.on('close', () => {
    unregisterEventClient(clientId);
  });
});

// GET /api/events (required authentication)
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      startDate,
      endDate,
      personName,
      personType,
      deviceName,
      category,
      direction,
      source,
      status,
      q
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Filtros
    const where: Prisma.AccessEventWhereInput = {};

    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) where.occurredAt.gte = new Date(startDate as string);
      if (endDate) where.occurredAt.lte = new Date(endDate as string);
    }

    if (personName) {
      where.personName = { contains: personName as string, mode: 'insensitive' };
    }

    if (personType && personType !== 'all') {
      const types = (personType as string).split(',').map(t => t.trim()).filter(Boolean);
      where.personType = types.length > 1 ? { in: types } : types[0];
    }

    if (deviceName) {
      where.deviceName = { contains: deviceName as string, mode: 'insensitive' };
    }

    if (category && category !== 'all') {
      where.category = category as string;
    }

    if (direction) {
      where.direction = direction as string;
    }

    if (source) {
      where.source = source as string;
    }

    if (status && status !== 'all') {
      where.status = status as string;
    }

    if (q) {
      const term = q as string;
      where.OR = [
        { personName: { contains: term, mode: 'insensitive' } },
        { unit: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
        { deviceName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, events] = await Promise.all([
      prisma.accessEvent.count({ where }),
      prisma.accessEvent.findMany({
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
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar eventos', details: error.message });
  }
});

export const eventsRoutes = router;
