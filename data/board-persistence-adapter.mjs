import { AUTOSAVE_HISTORY_LIMIT } from './autosave-history-utils.mjs';
import { normalizeSlotName } from './save-slots-utils.mjs';

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

function normalizeSaveSlotMetadata(slot = {}) {
  return {
    id: String(slot.id ?? ''),
    name: normalizeSlotName(slot.name),
    savedAt: slot.savedAt ? String(slot.savedAt) : new Date().toISOString()
  };
}

function parseSaveSlotMetadata(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeSaveSlotMetadata)
    .filter((slot) => slot.id)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

function stringifySaveSlotMetadata(slots) {
  return JSON.stringify((Array.isArray(slots) ? slots : []).map(normalizeSaveSlotMetadata));
}

function upsertSaveSlotMetadata(slots, slot) {
  const next = (Array.isArray(slots) ? slots : [])
    .filter((entry) => entry?.id !== slot?.id)
    .map(normalizeSaveSlotMetadata);
  next.push(normalizeSaveSlotMetadata(slot));
  return next.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

function removeSaveSlotMetadata(slots, slotId) {
  return (Array.isArray(slots) ? slots : [])
    .map(normalizeSaveSlotMetadata)
    .filter((slot) => slot.id !== slotId);
}

function normalizeAutosaveMetadata(entry = {}) {
  return {
    id: String(entry.id ?? ''),
    savedAt: entry.savedAt ? String(entry.savedAt) : new Date().toISOString()
  };
}

function parseAutosaveMetadata(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeAutosaveMetadata)
    .filter((entry) => entry.id)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

function stringifyAutosaveMetadata(entries) {
  return JSON.stringify((Array.isArray(entries) ? entries : []).map(normalizeAutosaveMetadata));
}

function pushAutosaveMetadata(entries, entry) {
  const next = [normalizeAutosaveMetadata(entry), ...(Array.isArray(entries) ? entries : []).map(normalizeAutosaveMetadata)
    .filter((current) => current.id !== entry?.id)];
  return next
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, AUTOSAVE_HISTORY_LIMIT);
}

function createInMemorySnapshotStore() {
  const snapshots = new Map();
  return {
    async getSnapshot(key) {
      return snapshots.has(key) ? structuredClone(snapshots.get(key)) : null;
    },
    async setSnapshot(key, value) {
      snapshots.set(key, structuredClone(value));
    },
    async deleteSnapshot(key) {
      snapshots.delete(key);
    }
  };
}

function createIndexedDbSnapshotStore(options = {}) {
  const dbName = options.dbName ?? 'drowvtt-board-persistence';
  const storeName = options.storeName ?? 'snapshots';

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    });
    return dbPromise;
  }

  async function withStore(mode, handler) {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      tx.oncomplete = () => finish(resolve);
      tx.onerror = () => finish(reject, tx.error || new Error('IndexedDB transaction failed.'));
      tx.onabort = () => finish(reject, tx.error || new Error('IndexedDB transaction aborted.'));

      try {
        handler(store);
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  return {
    async getSnapshot(key) {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(structuredClone(req.result ?? null));
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed.'));
      });
    },
    async setSnapshot(key, value) {
      await withStore('readwrite', (store) => store.put(structuredClone(value), key));
    },
    async deleteSnapshot(key) {
      await withStore('readwrite', (store) => store.delete(key));
    }
  };
}

export function createLocalBoardPersistenceAdapter(options = {}) {
  const storage = options.storage;
  const keys = { ...DEFAULT_KEYS, ...(options.keys || {}) };
  const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
  const snapshotStore = options.snapshotStore
    || (typeof indexedDB !== 'undefined' ? createIndexedDbSnapshotStore(options.indexedDb) : createInMemorySnapshotStore());

  assertStorage(storage);

  return {
    loadSaveSlots() {
      return parseSaveSlotMetadata(storage.getItem(keys.saveSlots));
    },

    async saveSlot({ id = '', name, snapshot }) {
      const nextSlot = {
        id: id || createId(),
        name: normalizeSlotName(name),
        savedAt: snapshot?.savedAt ?? null
      };
      await snapshotStore.setSnapshot(`slot:${nextSlot.id}`, snapshot ?? null);
      const slots = upsertSaveSlotMetadata(this.loadSaveSlots(), nextSlot);
      storage.setItem(keys.saveSlots, stringifySaveSlotMetadata(slots));
      return { slot: nextSlot, slots };
    },

    async loadSaveSlotSnapshot(slotId) {
      return await snapshotStore.getSnapshot(`slot:${slotId}`);
    },

    async deleteSaveSlot(slotId) {
      const currentSlots = this.loadSaveSlots();
      const slot = currentSlots.find((entry) => entry.id === slotId) || null;
      await snapshotStore.deleteSnapshot(`slot:${slotId}`);
      const slots = removeSaveSlotMetadata(currentSlots, slotId);
      storage.setItem(keys.saveSlots, stringifySaveSlotMetadata(slots));
      return { slot, slots };
    },

    loadAutosaveHistory() {
      return parseAutosaveMetadata(storage.getItem(keys.autosaveHistory));
    },

    async appendAutosave(snapshot) {
      const entry = {
        id: createId(),
        savedAt: snapshot?.savedAt ?? null
      };
      await snapshotStore.setSnapshot(`autosave:${entry.id}`, snapshot ?? null);
      const previousEntries = this.loadAutosaveHistory();
      const entries = pushAutosaveMetadata(previousEntries, entry);
      storage.setItem(keys.autosaveHistory, stringifyAutosaveMetadata(entries));
      const retainedIds = new Set(entries.map((current) => current.id));
      const removedEntries = previousEntries.filter((current) => !retainedIds.has(current.id));
      await Promise.all(removedEntries.map((current) => snapshotStore.deleteSnapshot(`autosave:${current.id}`)));
      return { entry, entries };
    },

    async loadAutosaveSnapshot(entryId) {
      return await snapshotStore.getSnapshot(`autosave:${entryId}`);
    },

    async clearAutosaveHistory() {
      const entries = this.loadAutosaveHistory();
      await Promise.all(entries.map((entry) => snapshotStore.deleteSnapshot(`autosave:${entry.id}`)));
      storage.removeItem(keys.autosaveHistory);
      return [];
    },

    getAutosaveEnabled() {
      const raw = storage.getItem(keys.autosaveEnabled);
      return raw === null ? true : raw === '1';
    },

    setAutosaveEnabled(enabled) {
      storage.setItem(keys.autosaveEnabled, enabled ? '1' : '0');
      return !!enabled;
    },

    keys
  };
}

export { DEFAULT_KEYS as BOARD_PERSISTENCE_STORAGE_KEYS };
