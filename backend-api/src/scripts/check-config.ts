import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    try {
        const count = await prisma.hikcentralConfig.count();
        console.log("Config count:", count);
        if (count > 0) {
            const config = await prisma.hikcentralConfig.findFirst();
            console.log(JSON.stringify(config, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
