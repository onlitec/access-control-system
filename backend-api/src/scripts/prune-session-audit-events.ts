import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const retentionDaysRaw = process.env.SESSION_AUDIT_RETENTION_DAYS || '90';
  const retentionDays = Number(retentionDaysRaw);
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error('SESSION_AUDIT_RETENTION_DAYS must be a non-negative number');
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await prisma.sessionAuditEvent.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });
  const remaining = await prisma.sessionAuditEvent.count();

  console.log(
    JSON.stringify(
      {
        action: 'prune_session_audit_events',
        retentionDays,
        cutoff: cutoff.toISOString(),
        deleted: deleted.count,
        remaining,
        timestamp: now.toISOString(),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('prune-session-audit-events error:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
