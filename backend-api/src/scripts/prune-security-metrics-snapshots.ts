import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { pruneSecurityMetricsSnapshots } from '../services/securityMetrics';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const retentionDaysRaw = process.argv[2] || process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS || '30';
  const retentionDays = Number(retentionDaysRaw);
  if (!Number.isFinite(retentionDays) || retentionDays < 0) {
    throw new Error('SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS must be a non-negative number');
  }

  const result = await pruneSecurityMetricsSnapshots(prisma, retentionDays);
  const remaining = await prisma.securityMetricSnapshot.count();

  console.log(
    JSON.stringify(
      {
        action: 'prune_security_metrics_snapshots',
        ...result,
        remaining,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      'prune-security-metrics-snapshots error:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
