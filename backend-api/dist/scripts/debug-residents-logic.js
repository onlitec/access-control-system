"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const EntityMappingService_1 = require("../services/EntityMappingService");
const HikCentralService_1 = require("../services/HikCentralService");
const hikConstants_1 = require("../config/hikConstants");
async function testGetResidents() {
    console.log('--- Simulating getResidents logic with FIX ---');
    // @ts-ignore
    const residentOrgCodes = await EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/residents');
    console.log('Resident Org Codes:', residentOrgCodes);
    try {
        const hikResult = await HikCentralService_1.HikCentralService.getPersonList({
            orgIndexCodes: residentOrgCodes,
            pageNo: 1,
            pageSize: 500,
        });
        const hikPersons = hikResult?.data?.list || [];
        console.log(`Total persons fetched from Hik API: ${hikPersons.length}`);
        const allPersons = hikPersons.map((p) => {
            const orgCode = String(p.orgIndexCode || '');
            const role = (0, hikConstants_1.resolveRoleFromOrg)(orgCode);
            const orgName = hikConstants_1.HIK_ORG_NAMES[orgCode] || p.orgName || 'DESCONHECIDO';
            return {
                id: p.personId || p.indexCode,
                firstName: p.personGivenName || p.personName || '',
                lastName: p.personFamilyName || '',
                orgIndexCode: orgCode,
                orgName,
                role
            };
        });
        const residents = allPersons.filter((r) => residentOrgCodes.includes(r.orgIndexCode));
        console.log(`Persons filtered as residents (Org ID in ${residentOrgCodes}): ${residents.length}`);
        if (residents.length > 0) {
            console.log('Sample Resident:', residents[0]);
        }
        console.log('Available OrgCodes in fetched list:', [...new Set(allPersons.map(p => p.orgIndexCode))]);
    }
    catch (error) {
        console.error('Error in simulation:', error.message);
    }
}
testGetResidents().catch(console.error);
