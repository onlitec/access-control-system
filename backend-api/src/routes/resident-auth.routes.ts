import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config/unifiedConfig';
import { cleanCpf as normalizeCpf, cpfEquals } from '../utils/cpf.utils';
import { AccessUrlService } from '../services/AccessUrlService';
import { HikCentralService } from '../services/HikCentralService';

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

    const cleanCpf = normalizeCpf(cpf);

    // CPF é salvo como o admin digitou (com ou sem pontuação), então a
    // comparação precisa normalizar os dois lados - não dá pra filtrar isso
    // no SQL sem uma função de regexp, e o volume de moradores por condomínio
    // é pequeno o bastante pra filtrar em memória.
    const candidates = await prisma.person.findMany({ where: { cpf: { not: null } } });
    const person = candidates.find((p) => p.cpf && cpfEquals(p.cpf, cleanCpf));

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

    const residentLabel = `${person.firstName} ${person.lastName}`.trim();
    // Montar o OR condicionalmente: um branch `{ visiting_unit: undefined }`
    // vira condição vazia no Prisma (casa com TUDO), e um morador sem
    // unit_number enxergaria os visitantes do condomínio inteiro.
    const visitorOr: object[] = [
      { visiting_resident: { contains: residentLabel, mode: 'insensitive' } },
    ];
    if (person.unit_number) {
      visitorOr.push({ visiting_unit: person.unit_number });
    }
    const visitors = await prisma.visitor.findMany({
      where: { OR: visitorOr },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ visitors });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Resolve os níveis de acesso concedidos para um cadastro novo: usa a
 * seleção explícita do morador quando enviada, senão herda o snapshot do
 * cadastro de origem - sempre revalidando contra o pool ATIVO do tipo
 * (o admin pode ter desativado níveis desde a visita anterior).
 */
async function resolveGrantedLevels(
  appliesTo: 'visitor' | 'provider',
  selectedIds: unknown,
  fallbackSnapshot: unknown,
): Promise<{ id: string; hikAccessLevelId: string; name: string }[]> {
  const select = { id: true, hikAccessLevelId: true, name: true };
  if (Array.isArray(selectedIds) && selectedIds.length > 0) {
    return prisma.grantableAccessLevel.findMany({
      where: { id: { in: selectedIds as string[] }, appliesTo, isActive: true },
      select,
    });
  }
  const snapshot = Array.isArray(fallbackSnapshot) ? (fallbackSnapshot as any[]) : [];
  if (snapshot.length === 0) return [];
  return prisma.grantableAccessLevel.findMany({
    where: { hikAccessLevelId: { in: snapshot.map((s) => String(s.hikAccessLevelId)) }, appliesTo, isActive: true },
    select,
  });
}

// ── GET /api/resident/access-levels ───────────────────────────────────────
// Pool de níveis de acesso aprovados pelo admin para o tipo pedido (visitor
// ou provider) - só o que estiver isActive entra na lista que o morador vê.
router.get('/access-levels', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.query.type as string;
    if (type !== 'visitor' && type !== 'provider') {
      res.status(400).json({ error: 'type deve ser "visitor" ou "provider"' });
      return;
    }
    const levels = await prisma.grantableAccessLevel.findMany({
      where: { appliesTo: type, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, hikAccessLevelId: true, name: true },
    });
    res.json({ accessLevels: levels });
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

    const { name, surname, phone, email, purpose, visitStartTime, visitEndTime, type, selectedAccessLevelIds } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Nome do visitante é obrigatório' });
      return;
    }

    // Nunca confiar em código de nível de acesso vindo direto do cliente:
    // só aceita o que estiver no pool aprovado pelo admin para "visitor".
    const grantedLevels = Array.isArray(selectedAccessLevelIds) && selectedAccessLevelIds.length > 0
      ? await prisma.grantableAccessLevel.findMany({
          where: { id: { in: selectedAccessLevelIds }, appliesTo: 'visitor', isActive: true },
          select: { id: true, hikAccessLevelId: true, name: true },
        })
      : [];

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
        status: 'PRE_REGISTERED',
        inviteToken,
        visiting_resident: `${person.firstName} ${person.lastName}`.trim(),
        visiting_unit: person.unit_number ?? null,
        tower: person.tower ?? null,
        selectedAccessLevels: grantedLevels,
        lgpdConsent: false,
      },
    });

    const appUrl = await AccessUrlService.getEffectiveAppUrl();
    const completionLink = `${appUrl}/login/guest-complete?token=${inviteToken}`;

    res.json({ success: true, visitor, completionLink });
  } catch (err: any) {
    console.error('[ResidentAuth] pre-register visitor error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/resident/visitors/:id/new-visit ─────────────────────────────
// Nova visita de um visitante JÁ cadastrado por este morador: copia a
// identidade da visita de origem (sem recadastro). Se a origem tem foto
// (cadastro concluído com verificação), a visita nasce ACTIVE - autorizada
// direto, sem link de conclusão; senão, gera novo link como no fluxo normal.
router.post('/visitors/:id/new-visit', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }

    const residentLabel = `${person.firstName} ${person.lastName}`.trim();
    const source = await prisma.visitor.findUnique({ where: { id: req.params.id } });
    // Posse: só visitas cujo anfitrião é este morador (mesma regra do GET)
    if (!source || !source.visiting_resident ||
        !source.visiting_resident.toLowerCase().includes(residentLabel.toLowerCase())) {
      res.status(404).json({ error: 'Visitante não encontrado' });
      return;
    }

    const { visitStartTime, visitEndTime, purpose, phone, email, plate, selectedAccessLevelIds } = req.body || {};

    const grantedLevels = await resolveGrantedLevels('visitor', selectedAccessLevelIds, source.selectedAccessLevels);

    const now = new Date();
    const startTime = visitStartTime ? new Date(visitStartTime) : now;
    const endTime = visitEndTime ? new Date(visitEndTime) : new Date(startTime.getTime() + 24 * 60 * 60 * 1000);

    // Origem com foto = identidade já verificada antes: visita já autorizada.
    const verified = Boolean(source.photo_url);
    const inviteToken = verified ? null : crypto.randomBytes(32).toString('hex');

    const visitor = await prisma.visitor.create({
      data: {
        name: source.name,
        surname: source.surname ?? '',
        full_name: source.full_name,
        document: source.document,
        certificateNo: source.certificateNo,
        certificateType: source.certificateType,
        phone: (typeof phone === 'string' ? phone : null) ?? source.phone,
        email: (typeof email === 'string' ? email : null) ?? source.email,
        plateNo: (typeof plate === 'string' ? plate : null) ?? source.plateNo,
        photo_url: source.photo_url,
        document_photo_url: source.document_photo_url,
        purpose: (typeof purpose === 'string' ? purpose : null) ?? source.purpose,
        type: source.type ?? 'VISITOR',
        visitStartTime: startTime,
        visitEndTime: endTime,
        status: verified ? 'ACTIVE' : 'PRE_REGISTERED',
        inviteToken,
        visiting_resident: residentLabel,
        visiting_unit: person.unit_number ?? null,
        tower: person.tower ?? null,
        selectedAccessLevels: grantedLevels,
        lgpdConsent: source.lgpdConsent,
        consentTimestamp: source.consentTimestamp,
      },
    });

    // Sincronização HikCentral em best-effort (mesmo padrão do
    // /api/invites/complete): falha aqui não bloqueia a visita local.
    if (verified) {
      try {
        const cleanPhoto = source.photo_url!.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
        const hikResult: any = await HikCentralService.reserveVisitor({
          visitorName: `${visitor.name} ${visitor.surname || ''}`.trim(),
          certificateNo: visitor.certificateNo || visitor.document || `DOC${Date.now()}`,
          visitStartTime: visitor.visitStartTime.toISOString(),
          visitEndTime: visitor.visitEndTime.toISOString(),
          plateNo: visitor.plateNo || undefined,
          visitorPicData: cleanPhoto,
        });
        const hikVisitorId = hikResult?.data?.visitorId;
        if (hikVisitorId) {
          await prisma.visitor.update({ where: { id: visitor.id }, data: { hikVisitorId } });
          const accessLevels = grantedLevels
            .map((g) => g.hikAccessLevelId)
            .filter((code) => !code.startsWith('local-') && !code.startsWith('area-'));
          if (accessLevels.length > 0) {
            await HikCentralService.authorizePerson(hikVisitorId, accessLevels, '2');
            console.log(`[ResidentAuth] Nova visita ${visitor.id}: níveis aplicados no HikCentral (${accessLevels.join(', ')})`);
          }
        }
      } catch (hikErr: any) {
        console.warn('[ResidentAuth] HikCentral indisponível na nova visita (segue só local):', hikErr.message);
      }
      res.json({ success: true, visitor });
      return;
    }

    const appUrl = await AccessUrlService.getEffectiveAppUrl();
    res.json({ success: true, visitor, completionLink: `${appUrl}/login/guest-complete?token=${inviteToken}` });
  } catch (err: any) {
    console.error('[ResidentAuth] new-visit error:', err.message);
    res.status(500).json({ error: err.message });
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

    const { fullName, document, phone, email, serviceType, validFrom, validUntil, selectedAccessLevelIds } = req.body;
    if (!fullName || !document || !serviceType) {
      res.status(400).json({ error: 'Nome, documento e tipo de serviço são obrigatórios' });
      return;
    }

    // Mesma regra do visitante: só aceita o que estiver no pool aprovado
    // pelo admin para "provider". Ainda não é enviado ao HikCentral (ver
    // comentário em selectedAccessLevels no schema) - fica salvo pra portaria.
    const grantedLevels = Array.isArray(selectedAccessLevelIds) && selectedAccessLevelIds.length > 0
      ? await prisma.grantableAccessLevel.findMany({
          where: { id: { in: selectedAccessLevelIds }, appliesTo: 'provider', isActive: true },
          select: { id: true, hikAccessLevelId: true, name: true },
        })
      : [];

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
        selectedAccessLevels: grantedLevels,
      },
    });

    res.json({ success: true, provider });
  } catch (err: any) {
    console.error('[ResidentAuth] pre-register provider error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/resident/providers/:id/new-service ──────────────────────────
// Nova prestação de serviço de um prestador JÁ cadastrado por este morador:
// copia a identidade da prestação de origem, com validade nova. Sem chamada
// HikCentral (paridade com o fluxo atual de prestador - portaria libera).
router.post('/providers/:id/new-service', residentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { personId } = (req as any).resident;
    const person = await prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      res.status(404).json({ error: 'Morador não encontrado' });
      return;
    }

    const residentLabel = `${person.firstName} ${person.lastName}`.trim();
    const source = await prisma.serviceProvider.findUnique({ where: { id: req.params.id } });
    if (!source || !source.visitingResident ||
        !source.visitingResident.toLowerCase().includes(residentLabel.toLowerCase())) {
      res.status(404).json({ error: 'Prestador não encontrado' });
      return;
    }

    const { serviceType, validFrom, validUntil, phone, email, selectedAccessLevelIds } = req.body || {};

    const grantedLevels = await resolveGrantedLevels('provider', selectedAccessLevelIds, source.selectedAccessLevels);

    const provider = await prisma.serviceProvider.create({
      data: {
        fullName: source.fullName,
        companyName: source.companyName,
        document: source.document,
        phone: (typeof phone === 'string' ? phone : null) ?? source.phone,
        email: (typeof email === 'string' ? email : null) ?? source.email,
        serviceType: (typeof serviceType === 'string' && serviceType.trim() ? serviceType : null) ?? source.serviceType,
        providerType: 'temporary',
        photoUrl: source.photoUrl,
        documentPhotoUrl: source.documentPhotoUrl,
        visitingResident: residentLabel,
        tower: person.tower ?? null,
        validFrom: (typeof validFrom === 'string' ? validFrom : null) ?? null,
        validUntil: (typeof validUntil === 'string' ? validUntil : null) ?? null,
        selectedAccessLevels: grantedLevels,
      },
    });

    res.json({ success: true, provider });
  } catch (err: any) {
    console.error('[ResidentAuth] new-service error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
