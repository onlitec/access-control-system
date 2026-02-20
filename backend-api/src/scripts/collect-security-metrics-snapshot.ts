import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createSecurityMetricsSnapshot } from '../services/securityMetrics';

dotenv.config();

const prisma = new PrismaClient();

const parsePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

async function main() {
  const cliWindowHours = process.argv[2];
  const cliTopN = process.argv[3];
  const windowHours = parsePositiveInt(
    cliWindowHours ?? process.env.SECURITY_METRICS_WINDOW_HOURS,
    24,
  );
  const topN = parsePositiveInt(
    cliTopN ?? process.env.SECURITY_METRICS_TOP_N,
    10,
  );

  const result = await createSecurityMetricsSnapshot(prisma, { windowHours, topN });
  console.log(
    JSON.stringify(
      {
        action: 'collect_security_metrics_snapshot',
        snapshot: result.snapshot,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      'collect-security-metrics-snapshot error:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
