"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
async function main() {
    try {
        const configs = await db_1.prisma.hikcentralConfig.findMany({
            orderBy: { createdAt: 'desc' }
        });
        console.log(`Found ${configs.length} configuration versions:`);
        configs.forEach((c, i) => {
            console.log(`\nVersion ${i + 1} (Created: ${c.createdAt})`);
            console.log(`ID: ${c.id}`);
            console.log(`API URL: ${c.apiUrl}`);
            console.log(`App Key: ${c.appKey}`);
            console.log(`App Secret: PRESENT (${c.appSecret?.length} chars)`);
        });
    }
    catch (error) {
        console.error('Error fetching HikCentral configs:', error);
    }
    finally {
        await db_1.prisma.$disconnect();
    }
}
main();
