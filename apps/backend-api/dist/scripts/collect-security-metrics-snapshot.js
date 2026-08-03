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
const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return parsed;
};
async function main() {
    const cliWindowHours = process.argv[2];
    const cliTopN = process.argv[3];
    const windowHours = parsePositiveInt(cliWindowHours ?? process.env.SECURITY_METRICS_WINDOW_HOURS, 24);
    const topN = parsePositiveInt(cliTopN ?? process.env.SECURITY_METRICS_TOP_N, 10);
    const result = await (0, securityMetrics_1.createSecurityMetricsSnapshot)(prisma, { windowHours, topN });
    console.log(JSON.stringify({
        action: 'collect_security_metrics_snapshot',
        snapshot: result.snapshot,
    }, null, 2));
}
main()
    .catch((error) => {
    console.error('collect-security-metrics-snapshot error:', error instanceof Error ? error.message : error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
