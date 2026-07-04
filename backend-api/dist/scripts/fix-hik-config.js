"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
async function main() {
    try {
        const workingIp = '100.77.145.39';
        const workingKey = '15581689';
        const workingSecret = 'pA9wh6Y2chcm5wUBe49O';
        console.log(`Updating HikCentral configuration to: https://${workingIp}`);
        // Deleting old configs to avoid confusion, or just updating the latest one
        await db_1.prisma.hikcentralConfig.deleteMany();
        const newConfig = await db_1.prisma.hikcentralConfig.create({
            data: {
                apiUrl: `https://${workingIp}`,
                appKey: workingKey,
                appSecret: workingSecret
            }
        });
        console.log('SUCCESS! Configuration updated.');
        console.log(`New Config ID: ${newConfig.id}`);
    }
    catch (error) {
        console.error('Error updating HikCentral config:', error);
    }
    finally {
        await db_1.prisma.$disconnect();
    }
}
main();
