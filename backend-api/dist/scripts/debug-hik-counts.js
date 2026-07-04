"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HikCentralService_1 = require("../services/HikCentralService");
async function main() {
    const orgs = ['2', '3', '7'];
    const visitorGroups = ['3'];
    console.log('=== Checking HikCentral Entity Counts ===\n');
    for (const orgId of orgs) {
        try {
            const result = await HikCentralService_1.HikCentralService.getPersonList({ orgIndexCode: orgId, pageNo: 1, pageSize: 1 });
            console.log(`Org ID ${orgId}: ${result?.data?.total || 0} persons`);
        }
        catch (e) {
            console.error(`Error checking Org ${orgId}:`, e.message);
        }
    }
    for (const vgId of visitorGroups) {
        try {
            const result = await HikCentralService_1.HikCentralService.fetchVisitorsWithStatus(vgId);
            console.log(`Visitor Group ID ${vgId}: ${result.length} active/recent appointments`);
            // Let's also check visitor info directly
            const vInfo = await HikCentralService_1.HikCentralService.hikRequest('/artemis/api/visitor/v1/visitor/visitorInfo', {
                pageNo: 1, pageSize: 1, searchCriteria: { visitorGroupID: vgId }
            });
            console.log(`Visitor Group ID ${vgId} (Raw Visitor Count): ${vInfo?.data?.total || 0} registered visitors`);
        }
        catch (e) {
            console.error(`Error checking Visitor Group ${vgId}:`, e.message);
        }
    }
}
main().catch(console.error);
