function normalizeSlotName(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed || 'Quick Save';
}

function normalizeSlotRecord(slot = {}) {
  return {
    id: String(slot.id ?? ''),
    name: normalizeSlotName(slot.name),
    savedAt: slot.savedAt ? String(slot.savedAt) : new Date().toISOString(),
    snapshot: slot.snapshot ?? null
  };
}

export function parseSaveSlots(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeSlotRecord)
    .filter((slot) => slot.id && slot.snapshot)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function stringifySaveSlots(slots) {
  return JSON.stringify((Array.isArray(slots) ? slots : []).map(normalizeSlotRecord));
}

export function upsertSaveSlot(slots, slot) {
  const next = (Array.isArray(slots) ? slots : [])
    .filter((entry) => entry?.id !== slot?.id)
    .map(normalizeSlotRecord);
  next.push(normalizeSlotRecord(slot));
  return next.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function removeSaveSlot(slots, slotId) {
  return (Array.isArray(slots) ? slots : [])
    .map(normalizeSlotRecord)
    .filter((slot) => slot.id !== slotId);
}

export { normalizeSlotName };
