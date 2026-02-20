"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function main() {
    const retentionDaysRaw = process.env.REFRESH_REVOKED_RETENTION_DAYS || '30';
    const retentionDays = Number(retentionDaysRaw);
    if (!Number.isFinite(retentionDays) || retentionDays < 0) {
        throw new Error('REFRESH_REVOKED_RETENTION_DAYS must be a non-negative number');
    }
    const now = new Date();
    const revokedCutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const expiredDeleted = await prisma.refreshSession.deleteMany({
        where: {
            expiresAt: {
                lt: now,
            },
        },
    });
    const revokedDeleted = await prisma.refreshSession.deleteMany({
        where: {
            revokedAt: {
                not: null,
                lt: revokedCutoff,
            },
            expiresAt: {
                gte: now,
            },
        },
    });
    const remaining = await prisma.refreshSession.count();
    console.log(JSON.stringify({
        action: 'prune_refresh_sessions',
        retentionDays,
        expiredDeleted: expiredDeleted.count,
        revokedDeleted: revokedDeleted.count,
        remaining,
        timestamp: now.toISOString(),
    }, null, 2));
}
main()
    .catch((error) => {
    console.error('prune-refresh-sessions error:', error instanceof Error ? error.message : error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
