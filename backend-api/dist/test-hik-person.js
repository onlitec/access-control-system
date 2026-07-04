"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("./services/HikCentralService");
async function main() {
    const res = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/resource/v1/person/personList', { pageNo: 1, pageSize: 500 });
    if (res.data && res.data.list) {
        console.log("Total fetch:", res.data.list.length);
        const orgCodes = new Map();
        for (const p of res.data.list) {
            const orgCode = String(p.orgIndexCode);
            orgCodes.set(orgCode, (orgCodes.get(orgCode) || 0) + 1);
        }
        console.log("OrgCodes distribution:", Object.fromEntries(orgCodes));
    }
    else {
        console.log("No list:", res);
    }
}
main();
