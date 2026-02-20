import { Prisma, PrismaClient } from '@prisma/client';

export type SecurityMetricIpAttempt = {
  ipAddress: string | null;
  attempts: number;
  failedAttempts: number;
  failureRate: number;
};

export type SecurityMetricUserAttempt = {
  userEmail: string | null;
  attempts: number;
  failedAttempts: number;
  failureRate: number;
};

export type SecurityMetricsResult = {
  generatedAt: string;
  topN: number;
  window: {
    hours: number;
    start: string;
    end: string;
  };
  login: {
    attempts: number;
    failedAttempts: number;
    failureRate: number;
  };
  topIpAttempts: SecurityMetricIpAttempt[];
  topUserAttempts: SecurityMetricUserAttempt[];
};

const sanitizeWindowHours = (windowHours: number, fallback: number): number => {
  if (!Number.isFinite(windowHours) || windowHours <= 0) return fallback;
  return Math.min(24 * 14, Math.floor(windowHours));
};

const sanitizeTopN = (topN: number, fallback: number): number => {
  if (!Number.isFinite(topN) || topN <= 0) return fallback;
  return Math.min(100, Math.floor(topN));
};

export const calculateSecurityMetrics = async (
  prisma: PrismaClient,
  params: {
    windowHours: number;
    topN: number;
    now?: Date;
  },
): Promise<SecurityMetricsResult> => {
  const effectiveWindowHours = sanitizeWindowHours(params.windowHours, 24);
  const effectiveTopN = sanitizeTopN(params.topN, 10);
  const now = params.now || new Date();
  const windowStart = new Date(now.getTime() - effectiveWindowHours * 60 * 60 * 1000);

  const loginWhere = {
    eventType: 'login',
    createdAt: { gte: windowStart },
  };
  const failedLoginWhere = {
    ...loginWhere,
    success: false,
  };

  const [
    totalLoginAttempts,
    failedLoginAttempts,
    ipAttempts,
    ipFailures,
    userAttempts,
    userFailures,
  ] = await Promise.all([
    prisma.sessionAuditEvent.count({ where: loginWhere }),
    prisma.sessionAuditEvent.count({ where: failedLoginWhere }),
    prisma.sessionAuditEvent.groupBy({
      by: ['ipAddress'],
      where: {
        ...loginWhere,
        ipAddress: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.sessionAuditEvent.groupBy({
      by: ['ipAddress'],
      where: {
        ...failedLoginWhere,
        ipAddress: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.sessionAuditEvent.groupBy({
      by: ['userEmail'],
      where: {
        ...loginWhere,
        userEmail: { not: null },
      },
      _count: { _all: true },
    }),
    prisma.sessionAuditEvent.groupBy({
      by: ['userEmail'],
      where: {
        ...failedLoginWhere,
        userEmail: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const ipFailureMap = new Map<string, number>();
  for (const row of ipFailures) {
    if (!row.ipAddress) continue;
    ipFailureMap.set(row.ipAddress, row._count._all);
  }
  const userFailureMap = new Map<string, number>();
  for (const row of userFailures) {
    if (!row.userEmail) continue;
    userFailureMap.set(row.userEmail, row._count._all);
  }

  const topIpAttempts = ipAttempts
    .filter((row) => row.ipAddress)
    .map((row) => {
      const attempts = row._count._all;
      const failures = ipFailureMap.get(row.ipAddress as string) || 0;
      return {
        ipAddress: row.ipAddress,
        attempts,
        failedAttempts: failures,
        failureRate: attempts > 0 ? Number(((failures / attempts) * 100).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, effectiveTopN);

  const topUserAttempts = userAttempts
    .filter((row) => row.userEmail)
    .map((row) => {
      const attempts = row._count._all;
      const failures = userFailureMap.get(row.userEmail as string) || 0;
      return {
        userEmail: row.userEmail,
        attempts,
        failedAttempts: failures,
        failureRate: attempts > 0 ? Number(((failures / attempts) * 100).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, effectiveTopN);

  return {
    generatedAt: now.toISOString(),
    topN: effectiveTopN,
    window: {
      hours: effectiveWindowHours,
      start: windowStart.toISOString(),
      end: now.toISOString(),
    },
    login: {
      attempts: totalLoginAttempts,
      failedAttempts: failedLoginAttempts,
      failureRate: totalLoginAttempts > 0
        ? Number(((failedLoginAttempts / totalLoginAttempts) * 100).toFixed(2))
        : 0,
    },
    topIpAttempts,
    topUserAttempts,
  };
};

const coerceIpAttempts = (value: Prisma.JsonValue): SecurityMetricIpAttempt[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const attempts = typeof row.attempts === 'number' ? row.attempts : Number(row.attempts || 0);
      const failedAttempts = typeof row.failedAttempts === 'number'
        ? row.failedAttempts
        : Number(row.failedAttempts || 0);
      const failureRate = typeof row.failureRate === 'number'
        ? row.failureRate
        : Number(row.failureRate || 0);
      const ipAddress = row.ipAddress == null ? null : String(row.ipAddress);
      return {
        ipAddress,
        attempts: Number.isFinite(attempts) ? attempts : 0,
        failedAttempts: Number.isFinite(failedAttempts) ? failedAttempts : 0,
        failureRate: Number.isFinite(failureRate) ? Number(failureRate.toFixed(2)) : 0,
      };
    })
    .filter(Boolean) as SecurityMetricIpAttempt[];
};

const coerceUserAttempts = (value: Prisma.JsonValue): SecurityMetricUserAttempt[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const attempts = typeof row.attempts === 'number' ? row.attempts : Number(row.attempts || 0);
      const failedAttempts = typeof row.failedAttempts === 'number'
        ? row.failedAttempts
        : Number(row.failedAttempts || 0);
      const failureRate = typeof row.failureRate === 'number'
        ? row.failureRate
        : Number(row.failureRate || 0);
      const userEmail = row.userEmail == null ? null : String(row.userEmail);
      return {
        userEmail,
        attempts: Number.isFinite(attempts) ? attempts : 0,
        failedAttempts: Number.isFinite(failedAttempts) ? failedAttempts : 0,
        failureRate: Number.isFinite(failureRate) ? Number(failureRate.toFixed(2)) : 0,
      };
    })
    .filter(Boolean) as SecurityMetricUserAttempt[];
};

export const createSecurityMetricsSnapshot = async (
  prisma: PrismaClient,
  params: {
    windowHours: number;
    topN: number;
    now?: Date;
  },
) => {
  const metrics = await calculateSecurityMetrics(prisma, params);
  const created = await prisma.securityMetricSnapshot.create({
    data: {
      generatedAt: new Date(metrics.generatedAt),
      periodStart: new Date(metrics.window.start),
      periodEnd: new Date(metrics.window.end),
      windowHours: metrics.window.hours,
      topN: metrics.topN,
      loginAttempts: metrics.login.attempts,
      loginFailedAttempts: metrics.login.failedAttempts,
      loginFailureRate: metrics.login.failureRate,
      topIpAttempts: metrics.topIpAttempts as unknown as Prisma.InputJsonValue,
      topUserAttempts: metrics.topUserAttempts as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    snapshot: {
      id: created.id,
      generatedAt: created.generatedAt.toISOString(),
      periodStart: created.periodStart.toISOString(),
      periodEnd: created.periodEnd.toISOString(),
      windowHours: created.windowHours,
      topN: created.topN,
      login: {
        attempts: created.loginAttempts,
        failedAttempts: created.loginFailedAttempts,
        failureRate: created.loginFailureRate,
      },
      topIpAttempts: coerceIpAttempts(created.topIpAttempts),
      topUserAttempts: coerceUserAttempts(created.topUserAttempts),
      createdAt: created.createdAt.toISOString(),
    },
    metrics,
  };
};

export const listSecurityMetricsHistory = async (
  prisma: PrismaClient,
  params: {
    limit: number;
    windowHours?: number;
    startTime?: Date;
    endTime?: Date;
  },
) => {
  const where: Prisma.SecurityMetricSnapshotWhereInput = {};
  if (params.windowHours && params.windowHours > 0) {
    where.windowHours = params.windowHours;
  }
  if (params.startTime || params.endTime) {
    where.generatedAt = {};
    if (params.startTime) where.generatedAt.gte = params.startTime;
    if (params.endTime) where.generatedAt.lte = params.endTime;
  }

  const rows = await prisma.securityMetricSnapshot.findMany({
    where,
    orderBy: { generatedAt: 'desc' },
    take: params.limit,
  });

  return rows
    .map((row) => ({
      id: row.id,
      generatedAt: row.generatedAt.toISOString(),
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      windowHours: row.windowHours,
      topN: row.topN,
      login: {
        attempts: row.loginAttempts,
        failedAttempts: row.loginFailedAttempts,
        failureRate: row.loginFailureRate,
      },
      topIpAttempts: coerceIpAttempts(row.topIpAttempts),
      topUserAttempts: coerceUserAttempts(row.topUserAttempts),
      createdAt: row.createdAt.toISOString(),
    }))
    .reverse();
};

export const pruneSecurityMetricsSnapshots = async (
  prisma: PrismaClient,
  retentionDays: number,
  now = new Date(),
) => {
  const safeRetentionDays = Number.isFinite(retentionDays) && retentionDays >= 0
    ? Math.floor(retentionDays)
    : 30;
  const cutoff = new Date(now.getTime() - safeRetentionDays * 24 * 60 * 60 * 1000);
  const deleted = await prisma.securityMetricSnapshot.deleteMany({
    where: {
      generatedAt: {
        lt: cutoff,
      },
    },
  });
  return {
    retentionDays: safeRetentionDays,
    cutoff: cutoff.toISOString(),
    deleted: deleted.count,
    timestamp: now.toISOString(),
  };
};
