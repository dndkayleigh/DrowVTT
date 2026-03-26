export const AUTOSAVE_HISTORY_LIMIT = 5;

function normalizeAutosaveEntry(entry = {}) {
  return {
    id: String(entry.id ?? ''),
    savedAt: entry.savedAt ? String(entry.savedAt) : new Date().toISOString(),
    snapshot: entry.snapshot ?? null
  };
}

export function parseAutosaveHistory(raw) {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeAutosaveEntry)
    .filter((entry) => entry.id && entry.snapshot)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function stringifyAutosaveHistory(entries) {
  return JSON.stringify((Array.isArray(entries) ? entries : []).map(normalizeAutosaveEntry));
}

export function pushAutosaveEntry(entries, entry) {
  const next = [normalizeAutosaveEntry(entry), ...(Array.isArray(entries) ? entries : []).map(normalizeAutosaveEntry)
    .filter((current) => current.id !== entry?.id)];
  return next
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, AUTOSAVE_HISTORY_LIMIT);
}
