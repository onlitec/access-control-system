export type SortBy = 'createdAt' | 'eventType' | 'success' | 'userEmail' | 'ipAddress';
export type SortOrder = 'asc' | 'desc';

export type FilterState = {
  userEmail: string;
  eventType: string;
  success: string;
  start: string;
  end: string;
  ipAddress: string;
  sessionId: string;
};

export const toDatetimeLocal = (date: Date) => {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
};

export const getNextSortOrder = (currentSortBy: SortBy, currentSortOrder: SortOrder, column: SortBy): SortOrder => {
  if (currentSortBy === column) return currentSortOrder === 'asc' ? 'desc' : 'asc';
  return column === 'createdAt' ? 'desc' : 'asc';
};

export const buildActiveFilterChips = (filters: FilterState) => {
  return [
    filters.userEmail ? { key: 'userEmail', label: `Email: ${filters.userEmail}` } : null,
    filters.eventType ? { key: 'eventType', label: `Evento: ${filters.eventType}` } : null,
    filters.success === 'true' ? { key: 'success', label: 'Sucesso: Sim' } : null,
    filters.success === 'false' ? { key: 'success', label: 'Sucesso: Não' } : null,
    filters.start ? { key: 'start', label: `De: ${new Date(filters.start).toLocaleString('pt-BR')}` } : null,
    filters.end ? { key: 'end', label: `Até: ${new Date(filters.end).toLocaleString('pt-BR')}` } : null,
    filters.ipAddress ? { key: 'ipAddress', label: `IP: ${filters.ipAddress}` } : null,
    filters.sessionId ? { key: 'sessionId', label: `Sessão: ${filters.sessionId}` } : null,
  ].filter(Boolean) as Array<{ key: keyof FilterState; label: string }>;
};
