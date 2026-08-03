#!/usr/bin/env node
"use strict";
/**
 * CLI Script: Migrate Person records from string-based location (tower/block/unit_number)
 * to foreign-key based (unitId) references.
 *
 * Usage:
 *   npm run migrate:persons -- --dry-run
 *   npm run migrate:persons -- --confirm
 *   npm run migrate:persons -- --report=orphans
 *   npm run migrate:persons -- --report=ambiguous
 *   npm run migrate:persons -- --fix=personId:unitId personId2:unitId2
 */
Object.defineProperty(exports, "__esModule", { value: true });
const PersonMigrationService_1 = require("../services/PersonMigrationService");
async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isConfirm = args.includes('--confirm');
    const reportType = args.find(a => a.startsWith('--report='))?.split('=')[1];
    const fixArg = args.find(a => a.startsWith('--fix='));
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  Person.unitId Migration Tool                          ║');
    console.log('║  Migrate from string (tower/block/unit_number) → FK    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    if (reportType) {
        // Report mode: show orphans or ambiguous records
        console.log(`📊 Generating ${reportType} report...\n`);
        if (reportType === 'orphans') {
            const orphans = await PersonMigrationService_1.PersonMigrationService.getOrphansReport();
            console.log(`Found ${orphans.length} orphaned persons:\n`);
            for (const o of orphans.slice(0, 50)) {
                console.log(`  ${o.personId}: ${o.name}`);
                console.log(`    → Tower: ${o.tower || 'null'}, Block: ${o.block || 'null'}, Unit: ${o.unit_number || 'null'}`);
                console.log(`    → Created: ${o.createdAt.toISOString()}\n`);
            }
            if (orphans.length > 50) {
                console.log(`  ... and ${orphans.length - 50} more\n`);
            }
        }
        else if (reportType === 'ambiguous') {
            const ambiguous = await PersonMigrationService_1.PersonMigrationService.getAmbiguousReport();
            console.log(`Found ${ambiguous.length} ambiguous matches:\n`);
            for (const a of ambiguous.slice(0, 50)) {
                console.log(`  ${a.personId}: ${a.name}`);
                console.log(`    → Tower: ${a.tower || 'null'}, Block: ${a.block || 'null'}, Unit: ${a.unit_number || 'null'}`);
                console.log(`    → Matches: ${a.matchingUnits} units\n`);
            }
            if (ambiguous.length > 50) {
                console.log(`  ... and ${ambiguous.length - 50} more\n`);
            }
        }
        return;
    }
    if (fixArg) {
        // Manual fix mode: apply fixes
        const fixPairs = fixArg.substring(6).split(' ').filter(p => p.includes(':'));
        const fixes = fixPairs.map(pair => {
            const [personId, unitId] = pair.split(':');
            return { personId, unitId };
        });
        console.log(`🔧 Applying ${fixes.length} manual fixes...\n`);
        const fixed = await PersonMigrationService_1.PersonMigrationService.batchFix(fixes);
        console.log(`✅ Fixed ${fixed} / ${fixes.length} records\n`);
        return;
    }
    // Main backfill mode
    if (!isDryRun && !isConfirm) {
        console.log('⚠️  LIVE MODE REQUIRES --confirm FLAG\n');
        console.log('Run with --dry-run first to preview changes:\n');
        console.log('  npx ts-node src/scripts/migratePersonUnits.ts --dry-run\n');
        console.log('Then confirm with:\n');
        console.log('  npx ts-node src/scripts/migratePersonUnits.ts --confirm\n');
        process.exit(1);
    }
    const result = await PersonMigrationService_1.PersonMigrationService.backfillUnitIds(isDryRun);
    console.log('\n📋 Backfill Results:\n');
    console.log(`  ✅ Matched: ${result.matched}`);
    console.log(`  ✅ Already migrated: ${result.alreadyMigrated}`);
    console.log(`  ⚠️  Orphans (manual review needed): ${result.orphans.length}`);
    console.log(`  ⚠️  Ambiguous (multiple matches): ${result.ambiguous.length}\n`);
    if (result.orphans.length > 0) {
        console.log('❌ Orphaned Records (No matching Unit found):\n');
        for (const o of result.orphans.slice(0, 10)) {
            console.log(`  ${o.personId}: ${o.name}`);
            console.log(`    Tower=${o.tower}, Block=${o.block}, Unit=${o.unit_number}\n`);
        }
        if (result.orphans.length > 10) {
            console.log(`  ... and ${result.orphans.length - 10} more\n`);
        }
    }
    if (result.ambiguous.length > 0) {
        console.log('⚠️  Ambiguous Records (Multiple units match):\n');
        for (const a of result.ambiguous.slice(0, 10)) {
            console.log(`  ${a.personId}: Tower=${a.tower}, Block=${a.block}, Unit=${a.unit_number}`);
            console.log(`    → ${a.unitCount} units match\n`);
        }
        if (result.ambiguous.length > 10) {
            console.log(`  ... and ${result.ambiguous.length - 10} more\n`);
        }
    }
    if (!isDryRun) {
        // Live backfill completed, run validation
        const validation = await PersonMigrationService_1.PersonMigrationService.validateMigration();
        console.log('✅ Migration Validation:\n');
        console.log(`  Total persons: ${validation.stats.totalPersons}`);
        console.log(`  With unitId: ${validation.stats.withUnitId}`);
        console.log(`  Orphans (still need fixes): ${validation.stats.orphans}`);
        console.log(`  Null location (no unit data): ${validation.stats.nullLocations}\n`);
        if (validation.isValid) {
            console.log('✅ MIGRATION SUCCESSFUL - All persons have valid unitId!\n');
        }
        else {
            console.log('⚠️  MIGRATION INCOMPLETE - Issues found:\n');
            for (const issue of validation.issues) {
                console.log(`  • ${issue}\n`);
            }
            console.log('Use --report=orphans or --report=ambiguous to see details.\n');
        }
    }
    else {
        console.log('ℹ️  DRY RUN MODE - No changes made.\n');
    }
}
main().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
