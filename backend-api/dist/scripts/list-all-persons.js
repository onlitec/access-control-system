"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function main() {
    const res = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/resource/v1/person/personList', {
        pageNo: 1, pageSize: 50
    });
    console.log('Total:', res?.data?.total);
    console.log('List count:', res?.data?.list?.length);
    const orgs = (res?.data?.list || []).map((p) => p.orgIndexCode);
    console.log('Orgs present in list:', [...new Set(orgs)]);
    // Count per org
    const counts = {};
    orgs.forEach((o) => counts[o] = (counts[o] || 0) + 1);
    console.log('Counts per org:', counts);
}
main().catch(console.error);
