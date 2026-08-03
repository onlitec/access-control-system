"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
    if (config) {
        console.log(`Key: "${config.appKey}", length: ${config.appKey.length}`);
        console.log(`Secret: "${config.appSecret}", length: ${config.appSecret.length}`);
        console.log(`Secret hex:`, Buffer.from(config.appSecret).toString('hex'));
    }
}
main();
