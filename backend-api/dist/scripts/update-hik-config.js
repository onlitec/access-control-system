"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const config = await prisma.hikcentralConfig.upsert({
        where: { id: 1 }, // Assuming id 1 or we can just create a new one
        update: {
            apiUrl: 'https://100.77.145.39',
            appKey: '15581689',
            appSecret: 'pA9wh6Y2chcm5wUBe49O'
        },
        create: {
            apiUrl: 'https://100.77.145.39',
            appKey: '15581689',
            appSecret: 'pA9wh6Y2chcm5wUBe49O'
        }
    });
    console.log('HikCentral Config updated:', config);
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
