"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function test() {
    const orgs = ['1', '2', '3', '4', '5', '6', '7'];
    for (const orgId of orgs) {
        console.log(`\n--- Org ${orgId} ---`);
        const res = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/resource/v1/person/personList', {
            pageNo: 1, pageSize: 100, orgIndexCodes: [orgId]
        });
        const persons = res?.data?.list || [];
        console.log(`Total reported for Org ${orgId}: ${res?.data?.total}`);
        console.log(`List count returned: ${persons.length}`);
        console.log(`Orgs in list:`, [...new Set(persons.map((p) => p.orgIndexCode))]);
    }
}
test().catch(console.error);
