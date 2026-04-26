import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HumanController,
  ScriptedController,
  SimpleGridRulesAdapter,
  UtilityController,
  createControllerRegistry,
  findPath,
  rankApproachCells,
  generateCandidateActions,
  hasBlockedMovementPath,
  hasLineOfSight,
  normalizeEncounterState,
  tacticalOutputToVttPlan,
  validateEncounterState
} from '../../packages/tactical-ai-core/src/index.js';
import {
  EXAMPLE_MONSTER_PROFILES,
  SAMPLE_ENCOUNTER_FIXTURES,
  normalizeMonsterProfile
} from '../../packages/tactical-ai-content/src/index.js';
import { compareControllers } from '../../packages/tactical-ai-devtools/src/index.js';

function encounterWithBlocking() {
  return normalizeEncounterState({
    id: 'blocked-shot',
    round: 1,
    activeActorId: 'goblin',
    battlefield: {
      gridSize: 64,
      width: 8,
      height: 8,
      edges: [{ orientation: 'h', x: 0, y: 1, blocksMovement: true, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'goblin',
        name: 'Goblin',
        side: 'monsters',
        cell: { x: 0, y: 0 },
        speed: 30,
        attacks: EXAMPLE_MONSTER_PROFILES[0].attacks
      },
      {
        id: 'hero',
        name: 'Hero',
        side: 'heroes',
        cell: { x: 0, y: 1 },
        speed: 30,
        attacks: []
      }
    ]
  });
}

test('tactical core validates and normalizes encounter state', () => {
  const result = validateEncounterState(encounterWithBlocking());
  assert.equal(result.ok, true);
  assert.equal(result.encounter.actors[0].name, 'Goblin');
  assert.equal(result.encounter.battlefield.edges[0].blocksLineOfSight, true);
});

test('simple grid rules enforce blocking edges for movement and line of sight', () => {
  const encounter = encounterWithBlocking();
  const goblin = encounter.actors[0];
  const hero = encounter.actors[1];
  const rules = new SimpleGridRulesAdapter();

  assert.equal(hasLineOfSight(encounter, goblin, hero), false);
  assert.equal(rules.lineOfSight(encounter, goblin, hero), false);
  assert.equal(hasBlockedMovementPath(encounter, goblin.cell, hero.cell), true);
  assert.equal(rules.reachableTiles(encounter, goblin).some((cell) => cell.x === 0 && cell.y === 1), false);
});

test('candidate generation avoids ranged shots through blocking edges', () => {
  const encounter = encounterWithBlocking();
  const goblin = encounter.actors[0];
  const candidates = generateCandidateActions(encounter, goblin);
  const hero = encounter.actors[1];
  const rangedCandidates = candidates.filter((candidate) =>
    candidate.action?.type === 'attack' && candidate.action?.attackKind === 'ranged'
  );

  assert.equal(rangedCandidates.some((candidate) => candidate.fromCell.x === 0 && candidate.fromCell.y === 0), false);
  assert.equal(rangedCandidates.every((candidate) => hasLineOfSight(encounter, goblin, hero, candidate.fromCell)), true);
  assert.ok(candidates.some((candidate) => candidate.family === 'hold_position'));
});

test('human scripted and utility controllers share one output contract', async () => {
  const encounter = SAMPLE_ENCOUNTER_FIXTURES[0].encounter;
  const scripted = await new ScriptedController().chooseAction({ encounter });
  const utility = await new UtilityController().chooseAction({ encounter });
  const human = await new HumanController().chooseAction({
    encounter,
    selectedCandidateId: scripted.selectedCandidateId
  });

  for (const output of [scripted, utility, human]) {
    const plan = tacticalOutputToVttPlan(output);
    assert.equal(Array.isArray(plan.moves), true);
    assert.equal(Array.isArray(plan.actions), true);
    assert.equal(typeof plan.end_turn, 'boolean');
    assert.ok(plan._controller.id);
  }
});

test('scripted baseline prefers a legal ranged attack over retreating', async () => {
  const encounter = SAMPLE_ENCOUNTER_FIXTURES[0].encounter;
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.equal(output.plan.actions[0].type, 'attack');
  assert.equal(output.plan.actions[0].attack_kind, 'ranged');
  assert.match(output.logs[0].message, /selected attack_from_current/);
  assert.equal(output.logs[0].data.familyCounts.hold_position, 1);
  assert.ok(output.logs[0].data.topCandidates.length > 0);
});

test('scripted baseline moves to attack instead of retreating when an attack is reachable this turn', async () => {
  const encounter = normalizeEncounterState({
    id: 'far-target',
    round: 1,
    activeActorId: 'orc',
    battlefield: { gridSize: 64, width: 12, height: 12, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 4, y: 6 },
        speed: 30,
        attacks: [{ name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 10, y: 6 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.match(output.selectedCandidateId, /^move_and_attack:/);
  assert.equal(output.plan.actions[0].type, 'attack');
  assert.notEqual(output.plan.actions[0].type, 'disengage');
});

test('scripted baseline advances instead of retreating when no attack is reachable this turn', async () => {
  const encounter = normalizeEncounterState({
    id: 'advance-target',
    round: 1,
    activeActorId: 'orc',
    battlefield: { gridSize: 64, width: 14, height: 12, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 4, y: 6 },
        speed: 30,
        attacks: [{ name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 12, y: 6 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.match(output.selectedCandidateId, /^advance_to_attack:/);
  assert.deepEqual(output.plan.moves[0].to, [8, 6]);
  assert.equal(output.plan.actions[0].type, 'dash');
  assert.equal(output.logs[0].data.selected.movementUsed, 4);
  assert.equal(output.logs[0].data.selected.reserveCells, 2);
  assert.match(output.logs[0].message, /1 advances/);
});

test('advance planning preserves movement reserve on long approaches', async () => {
  const encounter = normalizeEncounterState({
    id: 'long-approach-reserve',
    round: 1,
    activeActorId: 'orc',
    battlefield: { gridSize: 64, width: 18, height: 12, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 2, y: 6 },
        speed: 30,
        attacks: [{ name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 15, y: 6 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new UtilityController().chooseAction({ encounter });

  assert.match(output.selectedCandidateId, /^advance_to_attack:/);
  assert.equal(output.logs[0].data.selected.movementUsed, 4);
  assert.equal(output.logs[0].data.selected.reserveCells, 2);
  assert.equal(output.plan.moves[0].path.length, 4);
});

test('reachable tactical cells stay inside declared battlefield bounds', () => {
  const encounter = normalizeEncounterState({
    id: 'bounded',
    battlefield: { gridSize: 64, width: 6, height: 6, edges: [], tiles: [], interactables: [] },
    actors: [{ id: 'orc', name: 'Orc', side: 'monsters', cell: { x: 0, y: 0 }, speed: 30, attacks: [] }]
  });
  const rules = new SimpleGridRulesAdapter();
  const reachable = rules.reachableTiles(encounter, encounter.actors[0], { limit: 80 });

  assert.equal(reachable.some((cell) => cell.x < 0 || cell.y < 0), false);
  assert.equal(reachable.some((cell) => cell.x >= 6 || cell.y >= 6), false);
});

test('path-aware approach routes around blocking edges instead of moving into the block', async () => {
  const encounter = normalizeEncounterState({
    id: 'blocked-approach',
    round: 1,
    activeActorId: 'orc',
    battlefield: {
      gridSize: 64,
      width: 10,
      height: 7,
      edges: [
        { orientation: 'v', x: 5, y: 2, blocksMovement: true, blocksLineOfSight: true },
        { orientation: 'v', x: 5, y: 3, blocksMovement: true, blocksLineOfSight: true },
        { orientation: 'v', x: 5, y: 4, blocksMovement: true, blocksLineOfSight: true }
      ],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 2, y: 3 },
        speed: 15,
        attacks: [{ name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 7, y: 3 }, speed: 30, attacks: [] }
    ]
  });
  const orc = encounter.actors[0];
  const hero = encounter.actors[1];
  const straightBlockedPath = findPath(encounter, orc.cell, { x: 6, y: 3 });
  const approaches = rankApproachCells(encounter, orc, hero, orc.attacks, { limit: 1 });
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.ok(straightBlockedPath, 'a path around the blocking edge should exist');
  assert.deepEqual(approaches[0].cell, { x: 5, y: 1 });
  assert.deepEqual(output.plan.moves[0].to, [5, 1]);
  assert.deepEqual(output.logs[0].data.selected.futureAttackCell, { x: 6, y: 2 });
  assert.equal(output.logs[0].data.selected.remainingDistance, 1);
});

test('move-and-attack candidates emit routed paths instead of direct blocked paths', async () => {
  const encounter = normalizeEncounterState({
    id: 'blocked-move-attack-path',
    round: 1,
    activeActorId: 'archer',
    battlefield: {
      gridSize: 64,
      width: 4,
      height: 4,
      edges: [{ orientation: 'v', x: 1, y: 0, blocksMovement: true, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'archer',
        name: 'Archer',
        side: 'monsters',
        cell: { x: 0, y: 0 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 2, y: 1 }, speed: 30, attacks: [] }
    ]
  });
  const archer = encounter.actors[0];
  const candidates = generateCandidateActions(encounter, archer);
  const routedCandidate = candidates.find((candidate) =>
    candidate.family === 'move_and_attack' &&
    candidate.move?.to?.x === 1 &&
    candidate.move?.to?.y === 1
  );

  assert.ok(routedCandidate, 'expected a routed move-and-attack candidate');
  assert.deepEqual(routedCandidate.move.path, [{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  assert.equal(hasBlockedMovementPath(encounter, { x: 0, y: 0 }, { x: 1, y: 1 }), true);
  assert.equal(hasBlockedMovementPath(encounter, { x: 0, y: 0 }, { x: 0, y: 1 }), false);
  assert.equal(hasBlockedMovementPath(encounter, { x: 0, y: 1 }, { x: 1, y: 1 }), false);
});

test('tactical candidates do not choose occupied final destinations', async () => {
  const encounter = normalizeEncounterState({
    id: 'occupied-destination',
    round: 1,
    activeActorId: 'goblin',
    battlefield: { gridSize: 64, width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'goblin',
        name: 'Goblin',
        side: 'monsters',
        cell: { x: 0, y: 0 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 1, y: 1 },
        speed: 30,
        attacks: [{ name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 5, y: 1 }, speed: 30, attacks: [] }
    ]
  });
  const goblin = encounter.actors[0];
  const candidates = generateCandidateActions(encounter, goblin);
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.equal(candidates.some((candidate) => candidate.move?.to?.x === 1 && candidate.move?.to?.y === 1), false);
  assert.notDeepEqual(output.plan.moves[0]?.to, [1, 1]);
});

test('advance candidates avoid occupied future approach cells', async () => {
  const encounter = normalizeEncounterState({
    id: 'occupied-advance',
    round: 1,
    activeActorId: 'orc',
    battlefield: { gridSize: 64, width: 14, height: 12, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 4, y: 6 },
        speed: 30,
        attacks: [{ name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 }]
      },
      { id: 'goblin', name: 'Goblin', side: 'monsters', cell: { x: 10, y: 6 }, speed: 30, attacks: [] },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 12, y: 6 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.match(output.selectedCandidateId, /^advance_to_attack:/);
  assert.notDeepEqual(output.plan.moves[0].to, [10, 6]);
});

test('utility baseline explains top candidates and does not hold when a legal attack exists', async () => {
  const encounter = SAMPLE_ENCOUNTER_FIXTURES[0].encounter;
  const output = await new UtilityController().chooseAction({ encounter });

  assert.equal(output.plan.actions[0].type, 'attack');
  assert.notEqual(output.selectedCandidateId, 'hold_position:goblin');
  assert.match(output.logs[0].message, /Top candidates:/);
  assert.equal(output.logs[0].data.selected.actionType, 'attack');
  assert.ok(output.logs[0].data.selected.score > 0);
  assert.ok(output.logs[0].data.selected.features.attackValue > 0);
});

test('content normalization tracks provenance for missing custom monster fields', () => {
  const profile = normalizeMonsterProfile({ id: 'custom', name: 'Custom Archer', statblock: '- Sling: +3 to hit, range 30/120, 1d4+1 bludgeoning' }, { archetype: 'archer' });

  assert.equal(profile.speed, 30);
  assert.equal(profile.provenance.speed.source, 'archetype_default');
  assert.equal(profile.attacks[0].attackKind, 'ranged');
});

test('devtools comparison harness runs controllers over shared fixtures', async () => {
  const report = await compareControllers({
    controllerIds: ['scripted_baseline', 'utility_baseline'],
    fixtures: SAMPLE_ENCOUNTER_FIXTURES.slice(0, 1),
    registry: createControllerRegistry()
  });

  assert.equal(report.metrics.controllerCount, 2);
  assert.equal(report.metrics.fixtureCount, 1);
  assert.equal(report.reports.length, 2);
});
