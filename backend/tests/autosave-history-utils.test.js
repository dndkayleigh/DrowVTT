import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOSAVE_HISTORY_LIMIT, parseAutosaveHistory, pushAutosaveEntry, stringifyAutosaveHistory } from '../../data/autosave-history-utils.mjs';

test('pushAutosaveEntry keeps newest autosaves first and trims to the limit', () => {
  let entries = [];
  for (let index = 0; index < AUTOSAVE_HISTORY_LIMIT + 2; index += 1) {
    entries = pushAutosaveEntry(entries, {
      id: `entry-${index}`,
      savedAt: `2026-03-25T10:0${index}:00.000Z`,
      snapshot: { version: 1, state: { round: index + 1 } }
    });
  }

  assert.equal(entries.length, AUTOSAVE_HISTORY_LIMIT);
  assert.equal(entries[0].id, `entry-${AUTOSAVE_HISTORY_LIMIT + 1}`);
  assert.equal(entries.at(-1).id, 'entry-2');
});

test('autosave history round-trips through storage json', () => {
  const raw = stringifyAutosaveHistory([
    { id: 'a', savedAt: '2026-03-25T10:00:00.000Z', snapshot: { version: 1 } }
  ]);
  const parsed = parseAutosaveHistory(raw);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'a');
});
