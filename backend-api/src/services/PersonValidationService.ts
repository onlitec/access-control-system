import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PersonValidationData {
  firstName: string;
  lastName: string;
  unitId?: string | null;
  unit_number?: string | null;
  block?: string | null;
  tower?: string | null;
  departmentId?: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  unitId?: string | null;
}

/**
 * PersonValidationService: Validate person records for data consistency
 *
 * This service ensures that:
 * 1. Department references are valid (if provided)
 * 2. Unit references are valid (if provided)
 * 3. String-based location data matches actual units (during migration period)
 * 4. No data inconsistencies between new (unitId FK) and old (string) fields
 */
export class PersonValidationService {
  /**
   * Validate a person record before creation/update
   *
   * Checks:
   * - Department exists (if provided)
   * - Unit exists (if unitId provided)
   * - String location fields match actual units
   * - No conflicts between unitId and string fields
   *
   * @param data Person data to validate
   * @returns Validation result with errors (if any) and resolved unitId
   */
  static async validatePerson(data: PersonValidationData): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate department if provided
    if (data.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: data.departmentId }
      });
      if (!dept) {
        errors.push(`Department not found: ${data.departmentId}`);
      }
    }

    // Validate unitId FK if provided (new path)
    if (data.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: data.unitId },
        include: { tower: true, block: true }
      });
      if (!unit) {
        errors.push(`Unit not found: ${data.unitId}`);
      }
      // If both unitId and string fields provided, warn about potential mismatch
      if (data.unit_number || data.block || data.tower) {
        console.warn(
          `[PersonValidation] Both unitId and string location fields provided. Using unitId as source of truth.`
        );
      }
      return { isValid: errors.length === 0, errors, unitId: data.unitId };
    }

    // During migration: validate string fields (old path)
    if (data.unit_number || data.block || data.tower) {
      const matching = await prisma.unit.findMany({
        where: {
          AND: [
            data.unit_number ? { number: data.unit_number } : {},
            data.tower ? { tower: { name: data.tower } } : {},
            data.block ? { block: { name: data.block } } : {}
          ].filter(w => Object.keys(w).length > 0)
        },
        select: { id: true, number: true, tower: { select: { name: true } }, block: { select: { name: true } } }
      });

      if (matching.length === 0) {
        errors.push(
          `No unit found matching: Tower="${data.tower}", Block="${data.block}", Unit="${data.unit_number}"`
        );
      } else if (matching.length > 1) {
        errors.push(
          `Ambiguous: ${matching.length} units match Tower="${data.tower}", Block="${data.block}", Unit="${data.unit_number}"`
        );
      } else {
        // Exactly one match found
        return { isValid: errors.length === 0, errors, unitId: matching[0].id };
      }
    }

    // No location data at all (allowed for persons without assigned unit)
    if (!data.unitId && !data.unit_number && !data.block && !data.tower) {
      return { isValid: true, errors, unitId: null };
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Auto-resolve unitId from string fields (convenience method)
   *
   * Used during migration to convert string location data to unitId FK.
   * Returns null if no match found or ambiguous.
   *
   * @param tower Tower name (optional)
   * @param block Block name (optional)
   * @param unit_number Unit number (required)
   * @returns Unit ID if exactly one match found, null otherwise
   */
  static async resolveUnitId(
    tower?: string | null,
    block?: string | null,
    unit_number?: string | null
  ): Promise<string | null> {
    if (!unit_number) {
      return null;
    }

    const units = await prisma.unit.findMany({
      where: {
        AND: [
          { number: unit_number },
          tower ? { tower: { name: tower } } : {},
          block ? { block: { name: block } } : {}
        ].filter(w => Object.keys(w).length > 0)
      },
      select: { id: true }
    });

    if (units.length === 1) {
      return units[0].id;
    }

    return null;
  }

  /**
   * Get all units that match a location query
   * Useful for UI autocomplete/suggestions
   */
  static async suggestUnits(
    tower?: string,
    block?: string,
    unit_number?: string
  ): Promise<Array<{ id: string; number: string; tower: string; block?: string }>> {
    const where: any = {};

    if (unit_number) where.number = { contains: unit_number };
    if (tower) where.tower = { name: { contains: tower } };
    if (block) where.block = { name: { contains: block } };

    const units = await prisma.unit.findMany({
      where,
      include: { tower: { select: { name: true } }, block: { select: { name: true } } },
      take: 20
    });

    return units.map(u => ({
      id: u.id,
      number: u.number,
      tower: u.tower.name,
      block: u.block?.name
    }));
  }

  /**
   * Check for duplicate persons in the same unit (if uniqueness enforced)
   */
  static async checkDuplicate(unitId: string, firstName: string, lastName: string): Promise<boolean> {
    const existing = await prisma.person.findFirst({
      where: {
        unitId,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' }
      }
    });

    return !!existing;
  }
}
