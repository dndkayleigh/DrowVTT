import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HumanController,
  InternalV2PathfindingAdapter,
  LegacyPathfindingAdapter,
  PathfindingService,
  ScriptedController,
  SimpleGridRulesAdapter,
  SupervisorScriptedController,
  SupervisorScriptedGroupController,
  UtilityController,
  comparePathfindingAdapters,
  createControllerRegistry,
  createPathfindingAdapter,
  createPathfindingService,
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
  normalizeMonsterProfile,
  parseVisibleEncounterFixture
} from '../../packages/tactical-ai-content/src/index.js';
import {
  compareControllers,
  evaluateTacticalFixtureExpectations,
  runControllerFixture
} from '../../packages/tactical-ai-devtools/src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

test('legacy pathfinding adapter is the default service adapter', () => {
  const adapter = createPathfindingAdapter();
  const service = createPathfindingService();

  assert.equal(adapter.id, 'legacy');
  assert.equal(service.adapter.id, 'legacy');
  assert.equal(new PathfindingService({ adapterId: 'internal-v2' }).adapter.id, 'internal-v2');
});

test('legacy pathfinding adapter preserves open-grid diagonal behavior', () => {
  const encounter = normalizeEncounterState({
    id: 'open-path',
    battlefield: { gridSize: 64, width: 6, height: 6, edges: [], tiles: [], interactables: [] },
    actors: [{ id: 'orc', name: 'Orc', side: 'monsters', cell: { x: 0, y: 0 }, speed: 30, attacks: [] }]
  });
  const adapter = new LegacyPathfindingAdapter();
  const result = adapter.findPath({
    encounter,
    actor: encounter.actors[0],
    from: { row: 0, col: 0 },
    to: { row: 2, col: 2 }
  });

  assert.equal(result.found, true);
  assert.equal(result.cost, 2);
  assert.deepEqual(result.path, [{ row: 1, col: 1 }, { row: 2, col: 2 }]);
  assert.equal(result.adapterId, 'legacy');
});

test('pathfinding service exposes serializable reachable tiles and candidate moves', () => {
  const encounter = normalizeEncounterState({
    id: 'reachable-budget',
    battlefield: { gridSize: 64, width: 5, height: 5, edges: [], tiles: [], interactables: [] },
    actors: [{ id: 'orc', name: 'Orc', side: 'monsters', cell: { x: 0, y: 0 }, speed: 10, attacks: [] }]
  });
  const service = createPathfindingService();
  const reachable = service.reachable({ encounter, actor: encounter.actors[0], limit: 20 });
  const moves = service.getCandidateMoveActions(encounter.actors[0], encounter, { limit: 20 });

  assert.equal(reachable.adapterId, 'legacy');
  assert.ok(reachable.tiles.every((tile) => Number.isFinite(tile.cost)));
  assert.ok(reachable.tiles.some((tile) => tile.coord.row === 2 && tile.coord.col === 2));
  assert.ok(moves.every((move) => move.pathfindingAdapter === 'legacy'));
  assert.ok(moves.every((move) => Array.isArray(move.path)));
});

test('pathfinding comparison harness reports equivalent legacy and internal-v2 adapters', () => {
  const encounter = normalizeEncounterState({
    id: 'compare-pathfinding',
    battlefield: { gridSize: 64, width: 6, height: 6, edges: [], tiles: [], interactables: [] },
    actors: [{ id: 'orc', name: 'Orc', side: 'monsters', cell: { x: 0, y: 0 }, speed: 30, attacks: [] }]
  });
  const report = comparePathfindingAdapters({
    adapters: [new LegacyPathfindingAdapter(), new InternalV2PathfindingAdapter()],
    pathRequests: [{
      encounter,
      actor: encounter.actors[0],
      from: { row: 0, col: 0 },
      to: { row: 2, col: 2 }
    }],
    reachabilityRequests: [{ encounter, actor: encounter.actors[0], limit: 20 }]
  });

  assert.deepEqual(report.adapters, ['legacy', 'internal-v2']);
  assert.equal(report.pathComparisons[0].differences.foundMismatch, false);
  assert.equal(report.pathComparisons[0].differences.costMismatch, false);
  assert.equal(report.reachabilityComparisons[0].differences.legalDestinationMismatch, false);
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
  assert.equal(rangedCandidates.every((candidate) => hasLineOfSight(encounter, goblin, hero, candidate.action?.from || candidate.fromCell)), true);
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

test('supervisor scripted single ranks scripted candidates through the same output contract', async () => {
  const encounter = SAMPLE_ENCOUNTER_FIXTURES[0].encounter;
  const output = await new SupervisorScriptedController().chooseAction({ encounter });
  const plan = tacticalOutputToVttPlan(output);

  assert.equal(output.controllerId, 'supervisor_scripted_single');
  assert.equal(plan._controller.id, 'supervisor_scripted_single');
  assert.equal(plan.actions[0].type, 'attack');
  assert.ok(output.logs[0].data.supervisor.testedCandidateCount > 0);
  assert.match(output.logs[0].message, /Supervisor \+ Scripted selected/);
});

test('supervisor scripted group emits one combined VTT plan for grouped actors', async () => {
  const encounter = normalizeEncounterState({
    id: 'supervisor-group',
    round: 1,
    activeActorId: 'goblin-a',
    activationGroups: [{
      id: 'group',
      actorIds: ['goblin-a', 'goblin-b'],
      activationMode: 'coordinated_sequential'
    }],
    battlefield: { gridSize: 64, width: 10, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'goblin-a',
        name: 'Goblin A',
        side: 'monsters',
        cell: { x: 1, y: 1 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      {
        id: 'goblin-b',
        name: 'Goblin B',
        side: 'monsters',
        cell: { x: 1, y: 3 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 2 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new SupervisorScriptedGroupController().chooseAction({ encounter });
  const plan = tacticalOutputToVttPlan(output);

  assert.equal(output.controllerId, 'supervisor_scripted_group');
  assert.equal(plan.actions.length, 2);
  assert.equal(plan._controller.id, 'supervisor_scripted_group');
  assert.match(output.logs[0].message, /supervised 2 grouped activations/);
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

test('ranged move-and-attack preserves distance on equal-cost shots', async () => {
  const encounter = normalizeEncounterState({
    id: 'ranged-distance-tie',
    round: 1,
    activeActorId: 'archer',
    battlefield: {
      gridSize: 64,
      width: 8,
      height: 8,
      edges: [{ orientation: 'v', x: 3, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'archer',
        name: 'Archer',
        side: 'monsters',
        cell: { x: 2, y: 2 },
        speed: 10,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 4, y: 4 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new ScriptedController().chooseAction({ encounter });
  const selectedMove = output.plan.moves[0];

  assert.match(output.selectedCandidateId, /^(move_and_attack|shoot_and_scoot):/);
  assert.ok(selectedMove.path.length >= 1);
  const attackOrigin = output.plan.actions[0].from || selectedMove.to;
  const selectedDistance = Math.max(Math.abs(attackOrigin[0] - 4), Math.abs(attackOrigin[1] - 4));
  assert.ok(selectedDistance >= 2);
  assert.notDeepEqual(attackOrigin, [3, 1]);
  assert.match(output.logs[0].message, /(move_and_attack|shoot_and_scoot)@\(/);
});

test('long barrier encounter lets an orc route to an open javelin lane without occupying an ally cell', async () => {
  const encounter = normalizeEncounterState({
    id: 'long-barrier-ranged-pressure',
    round: 1,
    activeActorId: 'orc',
    battlefield: {
      gridSize: 64,
      width: 12,
      height: 12,
      edges: Array.from({ length: 10 }, (_, index) => ({
        orientation: 'v',
        x: 6,
        y: index + 1,
        blocksMovement: true,
        blocksLineOfSight: true
      })),
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'orc',
        name: 'Orc',
        side: 'monsters',
        cell: { x: 4, y: 6 },
        speed: 30,
        attacks: [
          { name: 'Greataxe', attackKind: 'melee', rangeFt: 5, expectedDamage: 9 },
          { name: 'Javelin', attackKind: 'ranged', rangeFt: 30, expectedDamage: 6 }
        ]
      },
      {
        id: 'goblin',
        name: 'Goblin A',
        side: 'monsters',
        cell: { x: 7, y: 0 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'aria', name: 'Aria', side: 'heroes', cell: { x: 8, y: 0 }, speed: 30, attacks: [] }
    ]
  });
  const output = await new ScriptedController().chooseAction({ encounter });

  assert.match(output.selectedCandidateId, /^(move_and_attack|shoot_and_scoot):/);
  assert.equal(output.plan.actions[0].type, 'attack');
  assert.equal(output.plan.actions[0].details, 'Javelin');
  assert.equal(output.plan.actions[0].attack_kind, 'ranged');
  assert.notDeepEqual(output.plan.moves[0].to, [7, 0]);
  const attackOrigin = output.plan.actions[0].from
    ? { x: output.plan.actions[0].from[0], y: output.plan.actions[0].from[1] }
    : { x: output.plan.moves[0].to[0], y: output.plan.moves[0].to[1] };
  assert.equal(hasLineOfSight(encounter, encounter.actors[0], encounter.actors[2], attackOrigin), true);
  assert.equal(output.logs[0].data.selected.pathLength, output.plan.moves[0].path.length);
  assert.match(output.logs[0].message, /(move_and_attack|shoot_and_scoot)@\(/);
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

test('content normalization preserves both modes for melee-or-ranged attacks', () => {
  const profile = normalizeMonsterProfile({
    id: 'orc',
    name: 'Orc',
    statblock: '- Javelin: Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.'
  }, { archetype: 'brute' });

  assert.deepEqual(
    profile.attacks.map((attack) => ({ name: attack.name, attackKind: attack.attackKind, rangeFt: attack.rangeFt })),
    [
      { name: 'Javelin', attackKind: 'melee', rangeFt: 5 },
      { name: 'Javelin', attackKind: 'ranged', rangeFt: 30 }
    ]
  );
});

test('visible YAML encounter fixture asserts long barrier tactical behavior', async () => {
  const fixturePaths = [
    '../../packages/tactical-ai-content/encounters/long-barrier-ranged-pressure.yaml',
    '../../packages/tactical-ai-content/encounters/files/bandit-doorway-ambush-2026-04-26.yaml',
    '../../packages/tactical-ai-content/encounters/files/shrine-of-the-mosswater-bandit-encounter-2026-04-28.yaml',
    '../../packages/tactical-ai-content/encounters/files/the-sinkhole-watch-2026-04-29.yaml'
  ];

  for (const fixturePath of fixturePaths) {
    const source = fs.readFileSync(path.resolve(__dirname, fixturePath), 'utf8');
    const fixture = parseVisibleEncounterFixture(source);

    assert.ok(fixture.id);
    assert.ok(fixture.encounter.battlefield.edges.length > 0);
    assert.ok(fixture.controllers.includes('scripted_baseline'));
    assert.ok(fixture.controllers.includes('utility_baseline'));

    for (const controllerId of fixture.controllers) {
      const report = await runControllerFixture({ controllerId, fixture });
      const evaluation = evaluateTacticalFixtureExpectations({ fixture, report });
      assert.equal(evaluation.ok, true, `${fixture.id} ${controllerId} failed: ${evaluation.failures.join(', ')}`);
    }
  }
});

test('shrine of the broken columns fixture targets deterministic controller iteration', async () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/shrine-of-the-broken-columns-2026-04-26.yaml'),
    'utf8'
  );
  const fixture = parseVisibleEncounterFixture(source);
  const monsterCounts = fixture.encounter.actors.reduce((counts, actor) => {
    if (actor.side !== 'monsters') return counts;
    const baseName = actor.name.replace(/ [A-Z]$/, '');
    counts[baseName] = (counts[baseName] || 0) + 1;
    return counts;
  }, {});

  assert.deepEqual(fixture.controllers, [
    'scripted_baseline',
    'scripted_baseline_group',
    'utility_baseline',
    'utility_baseline_group',
    'supervisor_scripted_single',
    'supervisor_scripted_group'
  ]);
  assert.deepEqual(monsterCounts, { Guard: 3, Scout: 2, Acolyte: 2 });
  assert.equal(fixture.encounter.activationGroups[0]?.actorIds.length, 7);
  assert.equal(fixture.encounter.battlefield.width, 13);
  assert.equal(fixture.encounter.battlefield.height, 13);

  for (const controllerId of fixture.controllers) {
    const report = await runControllerFixture({ controllerId, fixture });
    const evaluation = evaluateTacticalFixtureExpectations({ fixture, report });
    assert.equal(evaluation.ok, true, `${fixture.id} ${controllerId} failed: ${evaluation.failures.join(', ')}`);
  }

  const groupReport = await runControllerFixture({ controllerId: 'supervisor_scripted_group', fixture });
  assert.equal(groupReport.output.plan.actions.length, 7);

  const scriptedGroupReport = await runControllerFixture({ controllerId: 'scripted_baseline_group', fixture });
  assert.equal(scriptedGroupReport.output.plan.actions.length, 7);

  const utilityGroupReport = await runControllerFixture({ controllerId: 'utility_baseline_group', fixture });
  assert.equal(utilityGroupReport.output.plan.actions.length, 7);
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
