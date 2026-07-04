"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function main() {
    const res = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/resource/v1/person/personList', {
        pageNo: 1, pageSize: 50
    });
    const persons = res?.data?.list || [];
    console.log('Visible Persons:', persons.map((p) => `${p.personName} (Org: ${p.orgIndexCode})`));
}
main().catch(console.error);
