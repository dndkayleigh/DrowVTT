import { parseAutosaveHistory, pushAutosaveEntry, stringifyAutosaveHistory } from './autosave-history-utils.mjs';
import { normalizeSlotName, parseSaveSlots, removeSaveSlot, stringifySaveSlots, upsertSaveSlot } from './save-slots-utils.mjs';

const DEFAULT_KEYS = {
  saveSlots: 'drowvtt.saveSlots.v1',
  autosaveHistory: 'drowvtt.autosaveHistory.v1',
  autosaveEnabled: 'drowvtt.autosaveEnabled.v1'
};

function assertStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new Error('A storage implementation with getItem/setItem/removeItem is required.');
  }
}

export function createLocalBoardPersistenceAdapter(options = {}) {
  const storage = options.storage;
  const keys = { ...DEFAULT_KEYS, ...(options.keys || {}) };
  const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();

  assertStorage(storage);

  return {
    loadSaveSlots() {
      return parseSaveSlots(storage.getItem(keys.saveSlots));
    },

    saveSlot({ id = '', name, snapshot }) {
      const nextSlot = {
        id: id || createId(),
        name: normalizeSlotName(name),
        savedAt: snapshot?.savedAt ?? null,
        snapshot
      };
      const slots = upsertSaveSlot(this.loadSaveSlots(), nextSlot);
      storage.setItem(keys.saveSlots, stringifySaveSlots(slots));
      return { slot: nextSlot, slots };
    },

    deleteSaveSlot(slotId) {
      const currentSlots = this.loadSaveSlots();
      const slot = currentSlots.find((entry) => entry.id === slotId) || null;
      const slots = removeSaveSlot(currentSlots, slotId);
      storage.setItem(keys.saveSlots, stringifySaveSlots(slots));
      return { slot, slots };
    },

    loadAutosaveHistory() {
      return parseAutosaveHistory(storage.getItem(keys.autosaveHistory));
    },

    appendAutosave(snapshot) {
      const entry = {
        id: createId(),
        savedAt: snapshot?.savedAt ?? null,
        snapshot
      };
      const entries = pushAutosaveEntry(this.loadAutosaveHistory(), entry);
      storage.setItem(keys.autosaveHistory, stringifyAutosaveHistory(entries));
      return { entry, entries };
    },

    clearAutosaveHistory() {
      storage.removeItem(keys.autosaveHistory);
      return [];
    },

    getAutosaveEnabled() {
      return storage.getItem(keys.autosaveEnabled) === '1';
    },

    setAutosaveEnabled(enabled) {
      storage.setItem(keys.autosaveEnabled, enabled ? '1' : '0');
      return !!enabled;
    },

    keys
  };
}

export { DEFAULT_KEYS as BOARD_PERSISTENCE_STORAGE_KEYS };
