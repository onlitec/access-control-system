"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function main() {
    const res = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/resource/v1/person/personList', {
        pageNo: 1, pageSize: 1, orgIndexCodes: ['2']
    });
    console.log('Person Detail:', JSON.stringify(res?.data?.list?.[0], null, 2));
    console.log('Total for this query:', res?.data?.total);
}
main().catch(console.error);
