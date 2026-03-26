import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardSnapshotFilename, parseBoardSnapshotText } from '../../data/board-state-io-utils.mjs';

test('buildBoardSnapshotFilename uses a stable timestamped export name', () => {
  assert.equal(
    buildBoardSnapshotFilename('2026-03-25T21:07:00-04:00'),
    'drowvtt-board-save-20260325-2107.json'
  );
});

test('parseBoardSnapshotText reads wrapped snapshot json', () => {
  const parsed = parseBoardSnapshotText(JSON.stringify({
    version: 1,
    savedAt: '2026-03-25T21:07:00.000Z',
    state: {
      gridSize: 80,
      tokens: [{ id: 'a', name: 'Hero', x: 64, y: 64 }]
    }
  }));

  assert.equal(parsed.version, 1);
  assert.equal(parsed.savedAt, '2026-03-25T21:07:00.000Z');
  assert.equal(parsed.state.gridSize, 80);
  assert.equal(parsed.state.tokens[0].name, 'Hero');
});
