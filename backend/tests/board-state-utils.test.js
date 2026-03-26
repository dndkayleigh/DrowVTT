import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_STATE_VERSION, createBoardSnapshot, parseBoardSnapshot } from '../../data/board-state-utils.mjs';

test('createBoardSnapshot keeps only serializable board state', () => {
  const snapshot = createBoardSnapshot({
    gridSize: 70,
    snapMode: 'topleft',
    view: { zoom: 1.4, panX: 12, panY: -8 },
    map: {
      src: 'data:image/png;base64,abc',
      w: 900,
      h: 600,
      offX: 15,
      offY: -10,
      scale: 0.9,
      rot: 0.2,
      opacity: 0.75,
      img: { not: 'serializable' }
    },
    tokens: [{
      id: 'tok-1',
      name: 'Aria',
      type: 'PC',
      sizeCells: 1,
      color: '#5aa9ff',
      x: 128,
      y: 192,
      ac: 16,
      hp: '20/20',
      speed: 30,
      notes: 'Ready',
      statblock: 'Custom',
      art: {
        src: 'data:image/png;base64,token',
        scale: 1.5,
        panX: 0.2,
        panY: -0.1,
        fileName: 'aria.png',
        img: { transient: true },
        loading: true
      }
    }],
    selectedTokenId: 'tok-1',
    currentTurnTokenId: 'tok-1',
    draggingToken: { should: 'drop' },
    aiOverlay: { paths: [{ x: 1 }], summary: 'drop' },
    aiControls: 'PCs',
    round: 3
  }, { savedAt: '2026-03-25T20:00:00.000Z' });

  assert.equal(snapshot.version, BOARD_STATE_VERSION);
  assert.equal(snapshot.savedAt, '2026-03-25T20:00:00.000Z');
  assert.equal(snapshot.state.map.src, 'data:image/png;base64,abc');
  assert.equal('img' in snapshot.state.map, false);
  assert.equal(snapshot.state.tokens[0].art.fileName, 'aria.png');
  assert.equal('loading' in snapshot.state.tokens[0].art, false);
  assert.equal('draggingToken' in snapshot.state, false);
  assert.equal('aiOverlay' in snapshot.state, false);
});

test('parseBoardSnapshot normalizes missing and malformed values', () => {
  const parsed = parseBoardSnapshot({
    state: {
      gridSize: 'bad',
      snapMode: 'weird',
      view: { zoom: '2', panX: '7', panY: null },
      map: { src: 'map-data', scale: '1.25', opacity: '0.5' },
      tokens: [{
        id: 42,
        name: 'Goblin',
        sizeCells: 0.4,
        x: '96',
        y: undefined,
        ac: '13',
        hp: 7,
        speed: '30',
        art: { src: 'art-data', scale: '2', panX: '0.5', panY: '-0.25' }
      }],
      round: 0
    }
  });

  assert.equal(parsed.state.gridSize, 64);
  assert.equal(parsed.state.snapMode, 'center');
  assert.deepEqual(parsed.state.view, { zoom: 2, panX: 7, panY: 0 });
  assert.equal(parsed.state.map.scale, 1.25);
  assert.equal(parsed.state.map.opacity, 0.5);
  assert.equal(parsed.state.tokens[0].id, '42');
  assert.equal(parsed.state.tokens[0].sizeCells, 1);
  assert.equal(parsed.state.tokens[0].x, 96);
  assert.equal(parsed.state.tokens[0].y, 0);
  assert.equal(parsed.state.tokens[0].art.panY, -0.25);
  assert.equal(parsed.state.round, 1);
});
