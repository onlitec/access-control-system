import { describe, expect, it } from 'vitest';
import { buildActiveFilterChips, getNextSortOrder, toDatetimeLocal, type FilterState } from '../sessionAuditUtils';

describe('sessionAuditUtils', () => {
  it('formats datetime-local in local timezone-safe format', () => {
    const date = new Date('2026-02-20T12:34:56.000Z');
    const value = toDatetimeLocal(date);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('toggles sort order for same column and defaults for new column', () => {
    expect(getNextSortOrder('createdAt', 'desc', 'createdAt')).toBe('asc');
    expect(getNextSortOrder('createdAt', 'asc', 'createdAt')).toBe('desc');
    expect(getNextSortOrder('eventType', 'desc', 'createdAt')).toBe('desc');
    expect(getNextSortOrder('createdAt', 'desc', 'eventType')).toBe('asc');
  });

  it('builds active chips only for populated filters', () => {
    const filters: FilterState = {
      userEmail: 'security.test@local',
      eventType: 'login',
      success: 'false',
      start: '2026-02-20T09:00',
      end: '',
      ipAddress: '172.21.0.1',
      sessionId: '',
    };

    const chips = buildActiveFilterChips(filters);
    const labels = chips.map((chip) => chip.label);

    expect(labels).toContain('Email: security.test@local');
    expect(labels).toContain('Evento: login');
    expect(labels).toContain('Sucesso: Não');
    expect(labels.some((label) => label.startsWith('De: '))).toBeTruthy();
    expect(labels).toContain('IP: 172.21.0.1');
    expect(labels.some((label) => label.startsWith('Até: '))).toBeFalsy();
    expect(labels.some((label) => label.startsWith('Sessão: '))).toBeFalsy();
  });
});
