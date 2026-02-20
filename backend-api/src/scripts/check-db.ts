import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
    if (config) {
        console.log(`Key: "${config.appKey}", length: ${config.appKey.length}`);
        console.log(`Secret: "${config.appSecret}", length: ${config.appSecret.length}`);
        console.log(`Secret hex:`, Buffer.from(config.appSecret).toString('hex'));
    }
}

main();
