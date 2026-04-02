import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalBoardPersistenceAdapter } from '../../data/board-persistence-adapter.mjs';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test('local board persistence adapter saves and replaces named slots', () => {
  const adapter = createLocalBoardPersistenceAdapter({
    storage: createMemoryStorage(),
    createId: () => 'slot-1'
  });

  const first = adapter.saveSlot({
    name: '  Round 3 Start  ',
    snapshot: { version: 1, savedAt: '2026-04-02T12:00:00.000Z', state: { round: 3 } }
  });

  assert.equal(first.slot.id, 'slot-1');
  assert.equal(first.slot.name, 'Round 3 Start');
  assert.equal(first.slots.length, 1);

  const second = adapter.saveSlot({
    id: 'slot-1',
    name: 'Round 4 Start',
    snapshot: { version: 1, savedAt: '2026-04-02T12:10:00.000Z', state: { round: 4 } }
  });

  assert.equal(second.slots.length, 1);
  assert.equal(second.slots[0].name, 'Round 4 Start');
  assert.equal(second.slots[0].snapshot.state.round, 4);
});

test('local board persistence adapter appends and clears autosaves', () => {
  let idCounter = 0;
  const adapter = createLocalBoardPersistenceAdapter({
    storage: createMemoryStorage(),
    createId: () => `entry-${++idCounter}`
  });

  const first = adapter.appendAutosave({
    version: 1,
    savedAt: '2026-04-02T12:00:00.000Z',
    state: { round: 1 }
  });
  const second = adapter.appendAutosave({
    version: 1,
    savedAt: '2026-04-02T12:05:00.000Z',
    state: { round: 2 }
  });

  assert.equal(first.entry.id, 'entry-1');
  assert.equal(second.entry.id, 'entry-2');
  assert.deepEqual(adapter.loadAutosaveHistory().map((entry) => entry.id), ['entry-2', 'entry-1']);

  adapter.clearAutosaveHistory();
  assert.deepEqual(adapter.loadAutosaveHistory(), []);
});

test('local board persistence adapter stores autosave enabled preference', () => {
  const adapter = createLocalBoardPersistenceAdapter({
    storage: createMemoryStorage(),
    createId: () => 'unused'
  });

  assert.equal(adapter.getAutosaveEnabled(), false);
  adapter.setAutosaveEnabled(true);
  assert.equal(adapter.getAutosaveEnabled(), true);
  adapter.setAutosaveEnabled(false);
  assert.equal(adapter.getAutosaveEnabled(), false);
});

test('local board persistence adapter deletes slots and supports custom storage keys', () => {
  const storage = createMemoryStorage();
  const adapter = createLocalBoardPersistenceAdapter({
    storage,
    createId: () => 'slot-1',
    keys: {
      saveSlots: 'custom.save-slots',
      autosaveHistory: 'custom.autosaves',
      autosaveEnabled: 'custom.autosave-enabled'
    }
  });

  adapter.saveSlot({
    name: 'Quick Save',
    snapshot: { version: 1, savedAt: '2026-04-02T12:00:00.000Z', state: { round: 1 } }
  });

  assert.equal(storage.getItem('custom.save-slots') !== null, true);
  assert.equal(adapter.keys.saveSlots, 'custom.save-slots');

  const removed = adapter.deleteSaveSlot('slot-1');
  assert.equal(removed.slot?.id, 'slot-1');
  assert.deepEqual(removed.slots, []);
  assert.deepEqual(adapter.loadSaveSlots(), []);
});
