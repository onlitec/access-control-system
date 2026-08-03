"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonMigrationService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * PersonMigrationService: Safely migrate Person.tower/block/unit_number strings to Person.unitId FK
 *
 * This service handles the data migration from the old string-based location storage
 * to the new foreign-key based model that enforces referential integrity.
 *
 * Migration Steps:
 * 1. backfillUnitIds(dryRun=true) — test run, identify orphans/ambiguous records
 * 2. Manual review of orphans/ambiguous results
 * 3. backfillUnitIds(dryRun=false) — execute backfill
 * 4. validateMigration() — verify completeness
 * 5. Update code to use unitId joins instead of string fields
 * 6. Drop old string columns in release N+2
 */
class PersonMigrationService {
    /**
     * Backfill Person.unitId by matching tower+block+unit_number to Unit records
     *
     * @param dryRun If true, only report results without making changes
     * @returns Object with matched, orphans, ambiguous, and alreadyMigrated counts
     */
    static async backfillUnitIds(dryRun = true) {
        const result = { matched: 0, orphans: [], ambiguous: [], alreadyMigrated: 0 };
        console.log(`[PersonMigration] Starting ${dryRun ? 'DRY RUN' : 'LIVE'} backfill of Person.unitId...`);
        // Count already migrated
        result.alreadyMigrated = await prisma.person.count({ where: { unitId: { not: null } } });
        console.log(`[PersonMigration] Already migrated: ${result.alreadyMigrated}`);
        // Find all persons without unitId
        const persons = await prisma.person.findMany({
            where: { unitId: null },
            select: { id: true, firstName: true, lastName: true, tower: true, block: true, unit_number: true }
        });
        console.log(`[PersonMigration] Processing ${persons.length} persons without unitId...`);
        for (const p of persons) {
            // Skip if no location data at all
            if (!p.tower && !p.block && !p.unit_number) {
                continue;
            }
            // Find matching units: use provided fields as filters
            const whereConditions = {};
            if (p.unit_number)
                whereConditions.number = p.unit_number;
            if (p.tower)
                whereConditions.tower = { name: p.tower };
            if (p.block)
                whereConditions.block = { name: p.block };
            const matchingUnits = await prisma.unit.findMany({
                where: whereConditions,
                select: { id: true, number: true, tower: { select: { name: true } }, block: { select: { name: true } } }
            });
            if (matchingUnits.length === 1) {
                result.matched++;
                if (!dryRun) {
                    await prisma.person.update({
                        where: { id: p.id },
                        data: { unitId: matchingUnits[0].id }
                    });
                }
            }
            else if (matchingUnits.length === 0) {
                result.orphans.push({
                    personId: p.id,
                    name: `${p.firstName} ${p.lastName}`.trim(),
                    tower: p.tower || undefined,
                    block: p.block || undefined,
                    unit_number: p.unit_number || undefined
                });
            }
            else if (matchingUnits.length > 1) {
                result.ambiguous.push({
                    personId: p.id,
                    tower: p.tower || undefined,
                    block: p.block || undefined,
                    unit_number: p.unit_number || undefined,
                    unitCount: matchingUnits.length
                });
            }
        }
        console.log('[PersonMigration] Backfill Results:');
        console.log(`  ✓ Matched: ${result.matched}`);
        console.log(`  ✓ Already migrated: ${result.alreadyMigrated}`);
        console.log(`  ⚠ Orphans (need manual review): ${result.orphans.length}`);
        console.log(`  ⚠ Ambiguous (multiple matches): ${result.ambiguous.length}`);
        return result;
    }
    /**
     * Validate migration completeness and referential integrity
     */
    static async validateMigration() {
        const stats = {
            totalPersons: await prisma.person.count(),
            withUnitId: await prisma.person.count({ where: { unitId: { not: null } } }),
            orphans: await prisma.person.count({
                where: {
                    unitId: null,
                    OR: [{ tower: { not: null } }, { block: { not: null } }, { unit_number: { not: null } }]
                }
            }),
            nullLocations: await prisma.person.count({
                where: {
                    unitId: null,
                    tower: null,
                    block: null,
                    unit_number: null
                }
            })
        };
        const issues = [];
        if (stats.orphans > 0) {
            issues.push(`Found ${stats.orphans} orphaned persons without unitId but with location data (tower/block/unit_number)`);
        }
        const brokenFks = await prisma.person.count({
            where: {
                unitId: { not: null },
                unit: null // unitId doesn't resolve to valid unit
            }
        });
        if (brokenFks > 0) {
            issues.push(`Found ${brokenFks} broken FK references (unitId points to non-existent Unit)`);
        }
        return {
            isValid: issues.length === 0,
            issues,
            stats
        };
    }
    /**
     * Get detailed report of orphaned persons for manual review
     */
    static async getOrphansReport() {
        const orphans = await prisma.person.findMany({
            where: {
                unitId: null,
                OR: [{ tower: { not: null } }, { block: { not: null } }, { unit_number: { not: null } }]
            },
            select: { id: true, firstName: true, lastName: true, tower: true, block: true, unit_number: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        return orphans.map(p => ({
            personId: p.id,
            name: `${p.firstName} ${p.lastName}`.trim(),
            tower: p.tower || undefined,
            block: p.block || undefined,
            unit_number: p.unit_number || undefined,
            createdAt: p.createdAt
        }));
    }
    /**
     * Get detailed report of ambiguous matches (multiple units match the same person's location)
     */
    static async getAmbiguousReport() {
        const persons = await prisma.person.findMany({
            where: { unitId: null },
            select: { id: true, firstName: true, lastName: true, tower: true, block: true, unit_number: true }
        });
        const report = [];
        for (const p of persons) {
            if (!p.tower && !p.block && !p.unit_number)
                continue;
            const whereConditions = {};
            if (p.unit_number)
                whereConditions.number = p.unit_number;
            if (p.tower)
                whereConditions.tower = { name: p.tower };
            if (p.block)
                whereConditions.block = { name: p.block };
            const matchCount = await prisma.unit.count({ where: whereConditions });
            if (matchCount > 1) {
                report.push({
                    personId: p.id,
                    name: `${p.firstName} ${p.lastName}`.trim(),
                    tower: p.tower || undefined,
                    block: p.block || undefined,
                    unit_number: p.unit_number || undefined,
                    matchingUnits: matchCount
                });
            }
        }
        return report;
    }
    /**
     * Manual fix: Set unitId for a person
     * Used for handling orphans and ambiguous records after manual review
     */
    static async fixPerson(personId, unitId) {
        // Verify unit exists
        const unit = await prisma.unit.findUnique({ where: { id: unitId } });
        if (!unit) {
            throw new Error(`Unit not found: ${unitId}`);
        }
        // Verify person exists
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (!person) {
            throw new Error(`Person not found: ${personId}`);
        }
        // Update person
        await prisma.person.update({
            where: { id: personId },
            data: { unitId }
        });
        console.log(`[PersonMigration] Fixed: ${person.firstName} ${person.lastName} → Unit ${unit.number}`);
    }
    /**
     * Batch fix: Set unitId for multiple persons
     */
    static async batchFix(fixes) {
        let count = 0;
        for (const fix of fixes) {
            try {
                await this.fixPerson(fix.personId, fix.unitId);
                count++;
            }
            catch (err) {
                console.error(`[PersonMigration] Failed to fix ${fix.personId}: ${err.message}`);
            }
        }
        return count;
    }
}
exports.PersonMigrationService = PersonMigrationService;
