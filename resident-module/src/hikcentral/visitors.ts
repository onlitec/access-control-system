import { hikPost } from './client';
import { pickVisitorAccessLevelForTower } from './visitorAppointment';

interface VisitorLevel {
    privilegeGroupId?: string | number;
    privilegeGroupName?: string;
    isDefault?: number | string;
}

const LEVELS_TTL_MS = 5 * 60 * 1000;
let levels: { at: number; list: VisitorLevel[] } | null = null;

export async function listVisitorLevels(): Promise<VisitorLevel[]> {
    if (levels && Date.now() - levels.at < LEVELS_TTL_MS) return levels.list;
    const res = await hikPost('/artemis/api/acs/v1/privilege/group', { pageNo: 1, pageSize: 500, type: 2 });
    levels = { at: Date.now(), list: res.data?.list ?? [] };
    return levels.list;
}

/** Nível de visitante da primeira torre do morador que tiver um; senão o nível padrão. */
export async function pickLevelForTowers(towers: string[]): Promise<string | undefined> {
    const list = await listVisitorLevels();
    for (const tower of towers) {
        const byTower = pickVisitorAccessLevelForTower(list, tower);
        if (byTower) return byTower;
    }
    return pickVisitorAccessLevelForTower(list, undefined);
}

export async function createAppointment(payload: Record<string, unknown>): Promise<{ visitorId?: string; appointRecordId?: string }> {
    const res = await hikPost('/artemis/api/visitor/v2/appointment', payload);
    return {
        visitorId: res.data?.visitorId !== undefined ? String(res.data.visitorId) : undefined,
        appointRecordId: res.data?.appointRecordId !== undefined ? String(res.data.appointRecordId) : undefined,
    };
}

export async function deleteAppointment(appointRecordId: string): Promise<void> {
    await hikPost('/artemis/api/visitor/v1/appointment/single/delete', { appointRecordId });
}
