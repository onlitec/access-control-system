"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const securityMetrics_1 = require("../services/securityMetrics");
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function main() {
    const retentionDaysRaw = process.argv[2] || process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS || '30';
    const retentionDays = Number(retentionDaysRaw);
    if (!Number.isFinite(retentionDays) || retentionDays < 0) {
        throw new Error('SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS must be a non-negative number');
    }
    const result = await (0, securityMetrics_1.pruneSecurityMetricsSnapshots)(prisma, retentionDays);
    const remaining = await prisma.securityMetricSnapshot.count();
    console.log(JSON.stringify({
        action: 'prune_security_metrics_snapshots',
        ...result,
        remaining,
    }, null, 2));
}
main()
    .catch((error) => {
    console.error('prune-security-metrics-snapshots error:', error instanceof Error ? error.message : error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
