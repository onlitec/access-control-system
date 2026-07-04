"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EntityMappingService_1 = require("../services/EntityMappingService");
async function main() {
    const routes = [
        '/painel/residents',
        '/painel/staff',
        '/painel/visitors',
        '/painel/service-providers'
    ];
    console.log('=== Verifying Entity Mapping Resolution ===\n');
    for (const route of routes) {
        console.log(`--- Route: ${route} ---`);
        // Organizations
        const orgCodes = await EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback(route);
        console.log(`Resolved OrgCodes (w/ Fallback): [${orgCodes.join(', ')}]`);
        // Visitor Groups
        const visitorGroups = await EntityMappingService_1.EntityMappingService.resolveVisitorGroupsWithFallback(route);
        console.log(`Resolved VisitorGroups (w/ Fallback): [${visitorGroups.join(', ')}]`);
        const hasAny = await EntityMappingService_1.EntityMappingService.hasMappings(route);
        console.log(`Has Custom Mappings: ${hasAny ? '✅ YES' : '❌ NO'}`);
        console.log('');
    }
}
main().catch(console.error);
