import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/unifiedConfig';
import { VISITOR_STATUS, syncVisitorToHikCentral } from '../services/VisitorActivationService';

const router = Router();
const prisma = new PrismaClient();

const RESIDENT_JWT_EXPIRES = '8h';

// ── Middleware ─────────────────────────────────────────────────────────────

function residentAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }
  try {
    const decoded = jwt.verify(token, config.JWT.SECRET) as any;
    if (decoded.type !== 'resident') {
      res.status(403).json({ error: 'Acesso restrito a moradores' });
      return;
    }
    (req as any).resident = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// ── POST /api/resident/auth/login ─────────────────────────────────────────
// Validates CPF + phone against the Person table.
router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { cpf, password } = req.body as { cpf?: string; password?: string };
    if (!cpf || !password) {
      res.status(400).json({ error: 'CPF e senha são obrigatórios' });
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    const person = await prisma.person.findFirst({
      where: { cpf: { contains: cleanCpf } },
    });

    if (!person || !person.portalPassword) {
      res.status(401).json({ error: 'Acesso não configurado. Solicite o link de primeiro acesso à portaria.' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, person.portalPassword);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Senha incorreta.' });
      return;
    }

    // Gate de onboarding: só loga quem já teve a verificação facial aprovada
    // (automaticamente ou por revisão manual do admin).
    const verification = await prisma.onboardingFaceVerification.findUnique({
      where: { personId: person.id },
    });
    if (!verification || verification.status !== 'approved') {
      res.status(403).json({
        error:
          verification?.status === 'pending_admin_review'
            ? 'Seu cadastro está em análise pela portaria. Você será notificado quando aprovado.'
            : 'Cadastro incompleto. Finalize a verificação facial no link de primeiro acesso.',
      });
      return;
    }

    // Create session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h

    await prisma.residentSession.create({
      data: { personId: person.id, token: sessionToken, expiresAt },
    });

    const jwtToken = jwt.sign(
      {
        type: 'resident',
        personId: person.id,
        sessionToken,
        name: `${person.firstName} ${person.lastName}`.trim(),
      },
      config.JWT.SECRET,
      { expiresIn: RESIDENT_JWT_EXPIRES }
    );

    res.json({
      token: jwtToken,
      expiresIn: RESIDENT_JWT_EXPIRES,
      resident: {
        id: person.id,
        name: `${person.firstName} ${person.lastName}`.trim(),
        unit: person.unit_number,
        tower: person.tower,
        block: person.block,
        photoUrl: person.photoUrl,
      },
    });
  } catch (err: any) {
    console.error('[ResidentAuth] login error:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /api/resident/auth/logout ────────────────────────────────────────
router.post('/auth/logout', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = (req as any).resident;
    if (sessionToken) {
      await prisma.residentSession.deleteMany({ where: { token: sessionToken } });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/resident/auth/me ─────────────────────────────────────────────
router.get('/auth/me', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }
    res.json({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`.trim(),
      email: person.email,
      phone: person.phone,
      unit: person.unit_number,
      tower: person.tower,
      block: person.block,
      photoUrl: person.photoUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/resident/visitors ────────────────────────────────────────────
router.get('/visitors', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }

    // Convites novos são ligados pelo hostPersonId. A busca por nome cobre
    // convites antigos, criados antes desse campo existir. (O filtro antigo por
    // visiting_unit mostrava visitantes de outras torres com o mesmo número de
    // apartamento e, sem unidade, todos os visitantes.)
    const residentLabel = `${person.firstName} ${person.lastName}`.trim();
    const visitors = await prisma.visitor.findMany({
      where: {
        OR: [
          { hostPersonId: person.id },
          { hostPersonId: null, visiting_resident: { equals: residentLabel, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ visitors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/resident/visitors/pre-register ──────────────────────────────
router.post('/visitors/pre-register', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }

    const { name, surname, phone, email, purpose, visitStartTime, visitEndTime, type } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Nome do visitante é obrigatório' });
      return;
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const endTime = visitEndTime ? new Date(visitEndTime) : new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const visitor = await prisma.visitor.create({
      data: {
        name,
        surname: surname ?? '',
        phone: phone ?? null,
        email: email ?? null,
        purpose: purpose ?? null,
        type: type ?? 'VISITOR',
        visitStartTime: visitStartTime ? new Date(visitStartTime) : now,
        visitEndTime: endTime,
        status: VISITOR_STATUS.PRE_REGISTERED,
        inviteToken,
        hostPersonId: person.id,
        visiting_resident: `${person.firstName} ${person.lastName}`.trim(),
        visiting_unit: person.unit_number ?? null,
        tower: person.tower ?? null,
        // Store resident's hikPersonId so access levels can be inherited on completion
        accessLevelId: person.hikPersonId ?? null,
        lgpdConsent: false,
      },
    });

    const APP_URL = process.env.APP_URL || 'https://127.0.0.1:8443';
    const completionLink = `${APP_URL}/login/guest-complete?token=${inviteToken}`;

    res.json({ success: true, visitor, completionLink });
  } catch (err: any) {
    console.error('[ResidentAuth] pre-register visitor error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/resident/visitors/:id/approve ───────────────────────────────
// O morador aprova o cadastro feito pelo visitante; só então o visitante é
// enviado ao HikCentral e a facial passa a liberar o acesso.
router.post('/visitors/:id/approve', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const visitor = await prisma.visitor.findFirst({ where: { id: req.params.id, hostPersonId: personId } });
    if (!visitor) {
      res.status(404).json({ error: 'Visitante não encontrado' });
      return;
    }
    if (visitor.status !== VISITOR_STATUS.PENDING_APPROVAL) {
      res.status(409).json({ error: 'Este cadastro não está aguardando aprovação' });
      return;
    }
    if (visitor.visitEndTime < new Date()) {
      res.status(410).json({ error: 'O período desta visita já terminou. Gere um novo convite.' });
      return;
    }

    let hikVisitorId: string | undefined;
    try {
      hikVisitorId = await syncVisitorToHikCentral(visitor);
    } catch (hikErr: any) {
      // Mantém pendente para o morador tentar de novo; não libera só no banco local.
      console.error('[ResidentAuth] approve: falha ao enviar ao HikCentral:', hikErr.message);
      res.status(502).json({ error: 'Não foi possível liberar o acesso no sistema da portaria. Tente novamente em instantes.' });
      return;
    }

    const updated = await prisma.visitor.update({
      where: { id: visitor.id },
      data: {
        status: VISITOR_STATUS.ACTIVE,
        approvedAt: new Date(),
        hikVisitorId: hikVisitorId ?? visitor.hikVisitorId,
      },
    });
    res.json({ success: true, visitor: updated });
  } catch (err: any) {
    console.error('[ResidentAuth] approve visitor error:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── POST /api/resident/visitors/:id/reject ────────────────────────────────
router.post('/visitors/:id/reject', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const visitor = await prisma.visitor.findFirst({ where: { id: req.params.id, hostPersonId: personId } });
    if (!visitor) {
      res.status(404).json({ error: 'Visitante não encontrado' });
      return;
    }
    if (visitor.status !== VISITOR_STATUS.PENDING_APPROVAL) {
      res.status(409).json({ error: 'Este cadastro não está aguardando aprovação' });
      return;
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
    const updated = await prisma.visitor.update({
      where: { id: visitor.id },
      data: {
        status: VISITOR_STATUS.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: reason || null,
        // LGPD: cadastro recusado não precisa guardar biometria nem documento
        photo_url: null,
        document_photo_url: null,
      },
    });
    res.json({ success: true, visitor: updated });
  } catch (err: any) {
    console.error('[ResidentAuth] reject visitor error:', err.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ── GET /api/resident/providers ───────────────────────────────────────────
router.get('/providers', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }

    const residentLabel = `${person.firstName} ${person.lastName}`.trim();
    const providers = await prisma.serviceProvider.findMany({
      where: {
        visitingResident: { contains: residentLabel, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ providers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/resident/providers/pre-register ─────────────────────────────
router.post('/providers/pre-register', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }

    const { fullName, document, phone, email, serviceType, validFrom, validUntil } = req.body;
    if (!fullName || !document || !serviceType) {
      res.status(400).json({ error: 'Nome, documento e tipo de serviço são obrigatórios' });
      return;
    }

    const provider = await prisma.serviceProvider.create({
      data: {
        fullName,
        document,
        phone: phone ?? null,
        email: email ?? null,
        serviceType,
        providerType: 'temporary',
        visitingResident: `${person.firstName} ${person.lastName}`.trim(),
        tower: person.tower ?? null,
        validFrom: validFrom ?? null,
        validUntil: validUntil ?? null,
      },
    });

    res.json({ success: true, provider });
  } catch (err: any) {
    console.error('[ResidentAuth] pre-register provider error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
