import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_STATE_VERSION, createBoardSnapshot, parseBoardSnapshot } from '../../data/board-state-utils.mjs';
import {
  LEGACY_BOARD_SNAPSHOT_WITHOUT_TACTICAL,
  LIVE_TACTICAL_METADATA_SNAPSHOT,
  cloneBoardSnapshot
} from './fixtures/live-tactical-metadata-board-snapshots.fixture.mjs';

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
      tactical: {
        role: 'boss_caster',
        protected_asset: true,
        objective_role: 'ritual_actor',
        role_notes: 'Protected ritual caster',
        transient: { should: 'drop' }
      },
      attacks: [{
        name: 'Dagger',
        kind: 'melee',
        rangeFt: 5,
        expectedDamage: 4,
        tags: ['finesse']
      }],
      spells: [{
        name: 'Shield',
        kind: 'defensive',
        target: 'self',
        rangeFt: 0,
        expectedValue: 5,
        requiresLineOfSight: false
      }],
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
    selectedTokenIds: ['tok-1'],
    currentTurnTokenId: 'tok-1',
    aiGroupTokenIds: ['tok-1'],
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
  assert.deepEqual(snapshot.state.tokens[0].tactical, {
    role: 'boss_caster',
    authoredRole: 'boss_caster',
    coreRole: '',
    protectedAsset: true,
    objectiveRole: 'ritual_actor',
    roleNotes: 'Protected ritual caster'
  });
  assert.deepEqual(snapshot.state.tokens[0].attacks, [{
    name: 'Dagger',
    attackKind: 'melee',
    rangeFt: 5,
    expectedDamage: 4,
    tags: ['finesse']
  }]);
  assert.deepEqual(snapshot.state.tokens[0].spells, [{
    name: 'Shield',
    kind: 'defensive',
    target: 'self',
    rangeFt: 0,
    expectedValue: 5,
    requiresLineOfSight: false
  }]);
  assert.deepEqual(snapshot.state.selectedTokenIds, ['tok-1']);
  assert.deepEqual(snapshot.state.aiGroupTokenIds, ['tok-1']);
  assert.equal('loading' in snapshot.state.tokens[0].art, false);
  assert.equal('draggingToken' in snapshot.state, false);
  assert.equal('aiOverlay' in snapshot.state, false);
});

test('board snapshots round-trip tactical metadata and keep old tokens compatible', () => {
  const snapshot = createBoardSnapshot(
    cloneBoardSnapshot(LIVE_TACTICAL_METADATA_SNAPSHOT).state,
    { savedAt: '2026-05-02T12:00:00.000Z' }
  );

  const parsed = parseBoardSnapshot(snapshot);

  assert.deepEqual(parsed.state.tokens[0].tactical, {
    role: 'boss_caster',
    authoredRole: 'boss_caster',
    coreRole: '',
    protectedAsset: true,
    objectiveRole: 'ritual_actor',
    roleNotes: 'Protected ritual caster'
  });
  assert.equal('tactical' in parsed.state.tokens[1], false);
  assert.deepEqual(parsed.state.tokens[0].spells.map((spell) => spell.name), ['Shield']);
  assert.deepEqual(parsed.state.tokens[0].attacks.map((attack) => attack.name), ['Dagger']);

  const legacyParsed = parseBoardSnapshot(cloneBoardSnapshot(LEGACY_BOARD_SNAPSHOT_WITHOUT_TACTICAL));
  assert.equal('tactical' in legacyParsed.state.tokens[0], false);
  assert.deepEqual(legacyParsed.state.tokens[0].spells, []);
  assert.deepEqual(legacyParsed.state.tokens[0].attacks, []);

  const camelCaseParsed = parseBoardSnapshot({
    state: {
      tokens: [{
        id: 'ogre',
        name: 'Ogre',
        tactical: {
          authoredRole: 'brute_blocker',
          coreRole: 'disciplined_blocker',
          protectedAsset: false,
          objectiveRole: 'line_holder',
          roleNotes: 'Hold the entry'
        }
      }]
    }
  });

  assert.deepEqual(camelCaseParsed.state.tokens[0].tactical, {
    role: 'brute_blocker',
    authoredRole: 'brute_blocker',
    coreRole: 'disciplined_blocker',
    protectedAsset: false,
    objectiveRole: 'line_holder',
    roleNotes: 'Hold the entry'
  });
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
      selectedTokenIds: ['42', '99'],
      aiGroupTokenIds: ['42'],
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
  assert.deepEqual(parsed.state.selectedTokenIds, ['42', '99']);
  assert.deepEqual(parsed.state.aiGroupTokenIds, ['42']);
  assert.equal(parsed.state.round, 1);
});
