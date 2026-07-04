"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function main() {
    const res = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/resource/v1/org/orgList', {
        pageNo: 1, pageSize: 100
    });
    console.log('Organizations:', JSON.stringify(res?.data?.list, null, 2));
}
main().catch(console.error);
