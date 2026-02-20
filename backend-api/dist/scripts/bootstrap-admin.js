"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function main() {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME?.trim() || 'Admin';
    const role = process.env.ADMIN_ROLE?.trim() || 'ADMIN';
    if (!email || !password) {
        throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
    }
    if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD must have at least 8 characters');
    }
    const hashedPassword = await bcryptjs_1.default.hash(password, 12);
    const user = await prisma.user.upsert({
        where: { email },
        update: {
            name,
            role,
            password: hashedPassword,
        },
        create: {
            email,
            name,
            role,
            password: hashedPassword,
        },
    });
    console.log(`bootstrap-admin: user ready (${user.email}, role=${user.role})`);
}
main()
    .catch((error) => {
    console.error('bootstrap-admin error:', error instanceof Error ? error.message : error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
