"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
async function main() {
    try {
        const config = await db_1.prisma.hikcentralConfig.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        if (!config) {
            console.log('No HikCentral configuration found.');
        }
        else {
            console.log('HikCentral Configuration Found:');
            console.log(`API URL: ${config.apiUrl}`);
            console.log(`App Key: ${config.appKey}`);
            console.log(`App Secret: ${config.appSecret ? 'PRESENT (' + config.appSecret.length + ' chars)' : 'MISSING'}`);
            console.log(`ID: ${config.id}`);
            console.log(`Created At: ${config.createdAt}`);
        }
    }
    catch (error) {
        console.error('Error fetching HikCentral config:', error);
    }
    finally {
        await db_1.prisma.$disconnect();
    }
}
main();
