import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultSlotName, normalizeSlotName, parseSaveSlots, removeSaveSlot, stringifySaveSlots, upsertSaveSlot } from '../../data/save-slots-utils.mjs';

test('buildDefaultSlotName formats a stable session label from the creation date', () => {
  assert.equal(buildDefaultSlotName(new Date('2026-04-17T15:42:00.000Z')), 'New Session - 2026-04-17');
});

test('normalizeSlotName trims input and falls back to the default session name', () => {
  assert.equal(normalizeSlotName('  Round 3 start  '), 'Round 3 start');
  assert.equal(normalizeSlotName('   '), buildDefaultSlotName());
});

test('upsertSaveSlot replaces an existing slot and keeps newest first', () => {
  const slots = upsertSaveSlot([
    { id: 'a', name: 'Old', savedAt: '2026-03-25T10:00:00.000Z', snapshot: { version: 1 } },
    { id: 'b', name: 'Other', savedAt: '2026-03-25T11:00:00.000Z', snapshot: { version: 1 } }
  ], {
    id: 'a',
    name: 'Updated',
    savedAt: '2026-03-25T12:00:00.000Z',
    snapshot: { version: 1, state: { round: 4 } }
  });

  assert.deepEqual(slots.map((slot) => slot.id), ['a', 'b']);
  assert.equal(slots[0].name, 'Updated');
  assert.equal(slots[0].snapshot.state.round, 4);
});

test('parseSaveSlots and removeSaveSlot round-trip stored slot collections', () => {
  const raw = stringifySaveSlots([
    { id: 'alpha', name: 'Alpha', savedAt: '2026-03-25T09:00:00.000Z', snapshot: { version: 1 } },
    { id: 'beta', name: 'Beta', savedAt: '2026-03-25T10:00:00.000Z', snapshot: { version: 1 } }
  ]);
  const parsed = parseSaveSlots(raw);

  assert.deepEqual(parsed.map((slot) => slot.id), ['beta', 'alpha']);
  assert.deepEqual(removeSaveSlot(parsed, 'beta').map((slot) => slot.id), ['alpha']);
});

test('parseSaveSlots tolerates malformed stored json', () => {
  assert.deepEqual(parseSaveSlots('{not valid json'), []);
});
