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
  behaviorProfileForActor,
  hasBlockedMovementPath,
  hasLineOfSight,
  inferDefaultBehaviorProfile,
  normalizeEncounterState,
  normalizeBehaviorProfile,
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

function stonyShoreFixture() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/the-stony-shore-ambush-2026-05-09.yaml'),
    'utf8'
  );
  return parseVisibleEncounterFixture(source);
}

function zombieDoorwayFixture() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/zombie-doorway-press-2026-05-10.yaml'),
    'utf8'
  );
  return parseVisibleEncounterFixture(source);
}

function wolfPackFixture() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/wolf-pack-harrier-2026-05-10.yaml'),
    'utf8'
  );
  return parseVisibleEncounterFixture(source);
}

function isCellInBounds(encounter, cell) {
  const x = Number(cell?.x);
  const y = Number(cell?.y);
  return Number.isInteger(x)
    && Number.isInteger(y)
    && x >= 0
    && y >= 0
    && x < encounter.battlefield.width
    && y < encounter.battlefield.height;
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
  assert.ok(output.logs[0].data.battlefieldAssessment.doctrine);
  assert.ok(output.logs[0].data.doctrineActionTension.status);
  assert.match(output.logs[0].data.doctrineInfluence.note, /doctrine modifiers/);
  assert.equal(output.logs[0].data.reservations.length, 2);
  const actorLog = output.logs.find((log) => log.data?.diagnostics);
  assert.match(actorLog.message, /raw .*mechanically distinct .*tactical groups/);
  assert.ok(actorLog.data.diagnostics.selectedDeduplicatedRank >= 1);
  assert.ok(actorLog.data.diagnostics.selectedScoreBreakdown);
  assert.ok(actorLog.data.diagnostics.mechanicallyDistinctCandidateCount >= actorLog.data.diagnostics.tacticalGroupCount);
  assert.ok(actorLog.data.diagnostics.tacticalSummaryGroups.length > 0);
  assert.ok(actorLog.data.diagnostics.topRejectedAlternatives[0].targetLabels[0].includes('Hero'));
  assert.ok(actorLog.data.diagnostics.candidateSetHealth.role);
  assert.ok(actorLog.data.diagnostics.topRejectedAlternatives.length > 0);
  assert.ok(actorLog.data.diagnostics.roleCompliance.role);
  const doctrineInfluenceLog = output.logs.find((log) => log.phase === 'doctrine_influence');
  assert.match(doctrineInfluenceLog.message, /doctrine bonuses applied=/);
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
  assert.match(output.logs[0].message, /(move_and_attack|shoot_and_scoot).*@\(/);
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
  assert.match(output.logs[0].message, /(move_and_attack|shoot_and_scoot).*@\(/);
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

test('support casters can choose spells without advancing into melee', async () => {
  const encounter = normalizeEncounterState({
    id: 'caster-support',
    activeActorId: 'acolyte',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'acolyte',
        name: 'Acolyte',
        side: 'monsters',
        cell: { x: 7, y: 4 },
        speed: 30,
        attacks: [{ name: 'Club', attackKind: 'melee', rangeFt: 5, expectedDamage: 3 }],
        spells: [
          { name: 'Bless', kind: 'support', target: 'ally', rangeFt: 30, expectedValue: 5, requiresLineOfSight: false },
          { name: 'Sacred Flame', kind: 'damage', target: 'enemy', rangeFt: 60, expectedValue: 4 }
        ]
      },
      { id: 'guard', name: 'Hobgoblin', side: 'monsters', cell: { x: 6, y: 4 }, speed: 30, attacks: [] },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 0, y: 0 }, speed: 30, attacks: [] }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0]);
  assert.ok(candidates.some((candidate) => candidate.family === 'spell_from_current' && candidate.action?.details === 'Bless'));

  const output = await new UtilityController().chooseAction({ encounter, stance: 'protective' });
  assert.match(output.selectedCandidateId, /^spell_from_current:acolyte:guard:Bless/);
  assert.deepEqual(output.plan.moves, []);
  assert.equal(output.plan.actions[0].type, 'spell');
  assert.equal(output.plan.actions[0].details, 'Bless');
  assert.equal(output.plan.actions[0].target, 'Hobgoblin');

  const supervised = await new SupervisorScriptedController().chooseAction({ encounter, stance: 'protective' });
  const spellLog = supervised.logs.find((log) => log.phase === 'spell_targeting');
  assert.match(spellLog.message, /Bless is modeled as single_target/);
  assert.match(spellLog.message, /Hobgoblin \[guard\]/);
  const spellWarningLog = supervised.logs.find((log) => log.phase === 'spell_model_warning');
  assert.match(spellWarningLog.message, /Bless modeled as single_target/);
});

test('protect caster doctrine nudges target priority and logs score modifiers', async () => {
  const encounter = normalizeEncounterState({
    id: 'protect-caster-priority',
    activeActorId: 'goblin',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'goblin',
        name: 'Goblin',
        side: 'monsters',
        cell: { x: 2, y: 2 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      {
        id: 'acolyte',
        name: 'Acolyte',
        side: 'monsters',
        cell: { x: 3, y: 2 },
        speed: 30,
        attacks: [],
        spells: [{ name: 'Bless', kind: 'support', target: 'ally', rangeFt: 30, expectedValue: 5 }]
      },
      { id: 'aria', name: 'Aria', side: 'heroes', cell: { x: 7, y: 2 }, speed: 30, hp: '18/18', attacks: [] },
      { id: 'cam', name: 'Cam', side: 'heroes', cell: { x: 7, y: 4 }, speed: 30, hp: '18/18', attacks: [] }
    ]
  });

  const doctrineContext = {
    doctrine: 'protect_caster',
    protectedAsset: { id: 'acolyte', name: 'Acolyte' },
    primaryFocusTarget: { id: 'cam', name: 'Cam' }
  };
  const output = await new SupervisorScriptedController().chooseAction({ encounter, doctrineContext });
  const selected = output.logs[0].data.selected;

  assert.equal(selected.targetLabels[0], 'Cam [cam]');
  assert.ok(output.logs[0].data.diagnostics.selectedSupervisorBreakdown.targetPriorityMainThreatBonus > 0);
  assert.ok(output.logs[0].data.diagnostics.selectedSupervisorBreakdown.doctrineProtectCasterThreatBonus > 0);
});

test('supervisor role gate keeps support caster from club-charging when spells are viable', async () => {
  const encounter = normalizeEncounterState({
    id: 'support-caster-role-gate',
    activeActorId: 'acolyte',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'acolyte',
        name: 'Acolyte',
        side: 'monsters',
        cell: { x: 5, y: 4 },
        speed: 30,
        attacks: [{ name: 'Club', attackKind: 'melee', rangeFt: 5, expectedDamage: 16 }],
        spells: [
          { name: 'Bless', kind: 'support', target: 'ally', rangeFt: 30, expectedValue: 5, requiresLineOfSight: false },
          { name: 'Sacred Flame', kind: 'damage', target: 'enemy', rangeFt: 60, expectedValue: 4 }
        ]
      },
      { id: 'guard', name: 'Hobgoblin', side: 'monsters', cell: { x: 4, y: 4 }, speed: 30, attacks: [] },
      { id: 'ben', name: 'Ben', side: 'heroes', cell: { x: 6, y: 4 }, speed: 30, hp: '8/8', attacks: [] }
    ]
  });

  const doctrineContext = {
    doctrine: 'protect_caster',
    protectedAsset: { id: 'acolyte', name: 'Acolyte' },
    primaryFocusTarget: { id: 'ben', name: 'Ben' }
  };
  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    doctrineContext,
    stance: 'protective',
    candidateLimit: 36
  });

  assert.doesNotMatch(output.selectedCandidateId, /Club/);
  assert.equal(output.plan.actions[0].type, 'spell');
  assert.equal(output.logs[0].data.diagnostics.topByCategory.attack.supervisorBreakdown.roleSupportMeleeFallbackPenalty, -14);
});

test('supervisor role gate keeps ambusher bruiser from defaulting to ranged skirmish', async () => {
  const encounter = normalizeEncounterState({
    id: 'ambusher-role-gate',
    activeActorId: 'bugbear',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'bugbear',
        name: 'Bugbear',
        side: 'monsters',
        cell: { x: 2, y: 2 },
        speed: 30,
        attacks: [
          { name: 'Morningstar', attackKind: 'melee', rangeFt: 5, expectedDamage: 6 },
          { name: 'Javelin', attackKind: 'ranged', rangeFt: 30, expectedDamage: 6 }
        ]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 7, y: 2 }, speed: 30, attacks: [] },
      { id: 'ben', name: 'Ben', side: 'heroes', cell: { x: 7, y: 3 }, speed: 30, attacks: [] }
    ]
  });

  const output = await new SupervisorScriptedController().chooseAction({ encounter, candidateLimit: 36 });

  assert.doesNotMatch(output.selectedCandidateId, /^shoot_and_scoot:.*Javelin/);
  assert.equal(output.plan.actions[0].attack_kind, 'melee');
  assert.equal(output.plan.actions[0].details, 'Morningstar');
});

test('candidate truncation preserves hold position under ranged candidate pressure', () => {
  const encounter = normalizeEncounterState({
    id: 'candidate-pressure-hold',
    activeActorId: 'veteran',
    battlefield: {
      width: 12,
      height: 8,
      edges: [{ orientation: 'h', x: 3, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'disciplined_soldier' },
        attacks: [{ name: 'Heavy Crossbow', attackKind: 'ranged', rangeFt: 100, expectedDamage: 6 }]
      },
      { id: 'hero-a', name: 'Hero A', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] },
      { id: 'hero-b', name: 'Hero B', side: 'heroes', cell: { x: 7, y: 3 }, speed: 30, attacks: [] },
      { id: 'hero-c', name: 'Hero C', side: 'heroes', cell: { x: 6, y: 4 }, speed: 30, attacks: [] },
      { id: 'hero-d', name: 'Hero D', side: 'heroes', cell: { x: 7, y: 4 }, speed: 30, attacks: [] }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 6 });

  assert.equal(candidates.length, 6);
  assert.equal(candidates.some((candidate) => candidate.family === 'hold_position'), true);
});

test('candidate truncation preserves current ranged attacks under ranged candidate pressure', () => {
  const encounter = normalizeEncounterState({
    id: 'candidate-pressure-current-shot',
    activeActorId: 'veteran',
    battlefield: {
      width: 12,
      height: 8,
      edges: [{ orientation: 'h', x: 3, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'disciplined_soldier' },
        attacks: [{ name: 'Heavy Crossbow', attackKind: 'ranged', rangeFt: 100, expectedDamage: 6 }]
      },
      { id: 'hero-a', name: 'Hero A', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] },
      { id: 'hero-b', name: 'Hero B', side: 'heroes', cell: { x: 7, y: 3 }, speed: 30, attacks: [] },
      { id: 'hero-c', name: 'Hero C', side: 'heroes', cell: { x: 6, y: 4 }, speed: 30, attacks: [] },
      { id: 'hero-d', name: 'Hero D', side: 'heroes', cell: { x: 7, y: 4 }, speed: 30, attacks: [] }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 6 });

  assert.equal(candidates.length, 6);
  assert.equal(candidates.some((candidate) => candidate.family === 'attack_from_current'), true);
});

test('candidate truncation preserves advance-to-attack when late generated', () => {
  const encounter = normalizeEncounterState({
    id: 'candidate-pressure-advance',
    activeActorId: 'veteran',
    battlefield: {
      width: 14,
      height: 5,
      edges: [{ orientation: 'v', x: 4, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 2, y: 2 },
        speed: 30,
        tactical: { role: 'disciplined_soldier' },
        attacks: [
          { name: 'Longsword', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 },
          { name: 'Heavy Crossbow', attackKind: 'ranged', rangeFt: 100, expectedDamage: 6 }
        ]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 8, y: 2 }, speed: 30, attacks: [] }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 4 });

  assert.equal(candidates.length, 4);
  assert.equal(candidates.some((candidate) => candidate.family === 'advance_to_attack'), true);
});

test('disciplined blocker avoids shoot-and-scoot that abandons a protected caster screen', async () => {
  const encounter = normalizeEncounterState({
    id: 'blocker-protects-caster-screen',
    activeActorId: 'mage',
    activationGroups: [{ id: 'defenders', actorIds: ['mage', 'veteran'], activationMode: 'coordinated_sequential' }],
    battlefield: {
      width: 10,
      height: 7,
      edges: [{ orientation: 'h', x: 3, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'mage',
        name: 'Mage',
        side: 'monsters',
        cell: { x: 2, y: 3 },
        speed: 30,
        tactical: { role: 'boss_caster', protectedAsset: true },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }]
      },
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'disciplined_soldier' },
        attacks: [{ name: 'Heavy Crossbow', attackKind: 'ranged', rangeFt: 100, expectedDamage: 6 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] }
    ]
  });
  const veteran = encounter.actors.find((actor) => actor.id === 'veteran');
  const candidates = generateCandidateActions(encounter, veteran, { limit: 36 });

  assert.equal(candidates.some((candidate) => candidate.family === 'shoot_and_scoot'), true);
  assert.equal(candidates.some((candidate) => candidate.family === 'hold_position'), true);
  assert.equal(candidates.some((candidate) => candidate.family === 'attack_from_current'), true);

  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter,
    activationGroup: encounter.activationGroups[0],
    candidateLimit: 36
  });
  const veteranDecision = output.logs.find((log) => log.actorId === 'veteran' && log.phase === 'decision');

  assert.doesNotMatch(output.selectedCandidateId, /shoot_and_scoot:/);
  assert.equal(veteranDecision.data.diagnostics.candidateSetHealth.role, 'disciplined_blocker');
  assert.equal(veteranDecision.data.familyCounts.hold_position, 1);
  assert.equal(veteranDecision.data.familyCounts.attack_from_current, 1);
});

test('skirmisher still prefers shoot-and-scoot when not guarding a protected screen', async () => {
  const encounter = normalizeEncounterState({
    id: 'skirmisher-still-scoots',
    activeActorId: 'goblin',
    battlefield: {
      width: 10,
      height: 7,
      edges: [{ orientation: 'h', x: 3, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'goblin',
        name: 'Goblin',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] }
    ]
  });

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'goblin',
    candidateLimit: 36
  });

  assert.match(output.selectedCandidateId, /^shoot_and_scoot:/);
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'skirmisher');
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerShootAndScootBonusOffset, 0);
});

test('disciplined blocker may fire from current screening position', async () => {
  const encounter = normalizeEncounterState({
    id: 'blocker-current-ranged-screen',
    activeActorId: 'veteran',
    battlefield: { width: 10, height: 7, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'mage',
        name: 'Mage',
        side: 'monsters',
        cell: { x: 2, y: 3 },
        speed: 30,
        tactical: { role: 'boss_caster', protectedAsset: true },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }]
      },
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'disciplined_soldier' },
        attacks: [{ name: 'Heavy Crossbow', attackKind: 'ranged', rangeFt: 100, expectedDamage: 6 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] }
    ]
  });
  const doctrineContext = {
    doctrine: 'protect_caster',
    protectedAsset: { id: 'mage', name: 'Mage' },
    primaryFocusTarget: { id: 'hero', name: 'Hero' }
  };

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'veteran',
    doctrineContext,
    stance: 'protective',
    candidateLimit: 36
  });

  assert.match(output.selectedCandidateId, /^attack_from_current:/);
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'disciplined_blocker');
  assert.equal(output.logs[0].data.selected.protectedAssetSafetyDelta.assessment, 'preserves');
  assert.equal(output.logs[0].data.selected.protectedAssetSafetyDelta.protectedAsset.name, 'Mage');
  assert.equal(output.logs[0].data.diagnostics.selectedProtectedAssetSafetyDelta.finalScreens, true);
});

test('disciplined blocker may shoot-and-scoot when the hide cell preserves the protected screen', async () => {
  const encounter = normalizeEncounterState({
    id: 'blocker-preserving-scoot',
    activeActorId: 'veteran',
    battlefield: {
      width: 10,
      height: 7,
      edges: [{ orientation: 'h', x: 4, y: 3, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'mage',
        name: 'Mage',
        side: 'monsters',
        cell: { x: 2, y: 3 },
        speed: 30,
        tactical: { role: 'boss_caster', protectedAsset: true },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }]
      },
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 2 },
        speed: 30,
        tactical: { role: 'disciplined_soldier' },
        attacks: [{ name: 'Heavy Crossbow', attackKind: 'ranged', rangeFt: 100, expectedDamage: 3 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] }
    ]
  });
  const doctrineContext = {
    doctrine: 'protect_caster',
    protectedAsset: { id: 'mage', name: 'Mage' },
    primaryFocusTarget: { id: 'hero', name: 'Hero' }
  };

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'veteran',
    doctrineContext,
    stance: 'protective',
    candidateLimit: 36
  });

  assert.match(output.selectedCandidateId, /^shoot_and_scoot:/);
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'disciplined_blocker');
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerShootAndScootBonusOffset, -4);
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerAbandonsLinePenalty, undefined);
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerScreenBonus, 3);
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.doctrineBlockerLaneBonus, 2);
  assert.match(output.logs[0].data.selected.protectedAssetSafetyDelta.assessment, /^(improves|preserves)$/);
  assert.equal(output.logs[0].data.selected.protectedAssetSafetyDelta.maintainsProtectedScreen, true);
});

test('bugbear ambusher candidates include hidden and stalking options', () => {
  const encounter = normalizeEncounterState({
    id: 'bugbear-ambush-options',
    activeActorId: 'bugbear',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'bugbear',
        name: 'Bugbear',
        side: 'monsters',
        cell: { x: 2, y: 2 },
        speed: 30,
        attacks: [{ name: 'Morningstar', attackKind: 'melee', rangeFt: 5, expectedDamage: 6 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 9, y: 2 }, speed: 30, attacks: [] }
    ]
  });
  const families = new Set(generateCandidateActions(encounter, encounter.actors[0], { limit: 36 }).map((candidate) => candidate.family));

  assert.equal(families.has('hold_hidden'), true);
  assert.equal(families.has('stalk_to_cover'), true);
});

test('large ambusher bruiser generates move_and_attack and attack_isolated_target in a simple legal lane', () => {
  const encounter = normalizeEncounterState({
    id: 'large-ambusher-open-lane',
    round: 1,
    activeActorId: 'crocodile',
    battlefield: { gridSize: 64, width: 14, height: 10, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'crocodile',
        name: 'Giant Crocodile',
        side: 'monsters',
        cell: { x: 1, y: 3 },
        sizeCells: 3,
        speed: 30,
        tactical: { role: 'grappler_ambusher', coreRole: 'ambusher_bruiser' },
        attacks: [{ name: 'Bite', attackKind: 'melee', rangeFt: 5, expectedDamage: 12 }]
      },
      {
        id: 'hero',
        name: 'Hero',
        side: 'heroes',
        cell: { x: 8, y: 4 },
        sizeCells: 1,
        speed: 30,
        attacks: [{ name: 'Strike', attackKind: 'melee', rangeFt: 5, expectedDamage: 6 }]
      }
    ]
  });
  const crocodile = encounter.actors[0];
  const candidates = generateCandidateActions(encounter, crocodile, { limit: 36 });
  const families = new Set(candidates.map((candidate) => candidate.family));

  assert.equal(families.has('move_and_attack'), true);
  assert.equal(families.has('attack_isolated_target'), true);
  assert.equal(families.has('hold_hidden'), true);
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

test('explicit actor behavior normalizes correctly without changing tactical role resolution', () => {
  const actor = normalizeEncounterState({
    id: 'behavior-explicit',
    round: 1,
    activeActorId: 'zombie',
    battlefield: { gridSize: 64, width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [{
      id: 'zombie',
      name: 'Zombie',
      side: 'monsters',
      cell: { x: 1, y: 1 },
      speed: 20,
      tactical: { role: 'melee_disrupter', mapped_core_role: 'ambusher_bruiser' },
      behavior: {
        cognition: 'mindless',
        drive: 'nearest_living_prey',
        riskTolerance: 'fearless',
        coordination: 'none',
        planningHorizon: 'immediate',
        targetStickiness: 'high'
      },
      attacks: [{ name: 'Slam', attackKind: 'melee', rangeFt: 5, expectedDamage: 4 }]
    }]
  }).actors[0];

  assert.deepEqual(actor.behavior, {
    cognition: 'mindless',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  });
  assert.equal(actor.tactical.coreRole, 'ambusher_bruiser');
});

test('actors without behavior receive the default trained squad behavior profile', () => {
  const actor = normalizeEncounterState({
    id: 'behavior-default',
    round: 1,
    activeActorId: 'guard',
    battlefield: { gridSize: 64, width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [{
      id: 'guard',
      name: 'Guard',
      side: 'monsters',
      cell: { x: 1, y: 1 },
      speed: 30,
      tactical: { role: 'disciplined_soldier' },
      attacks: [{ name: 'Spear', attackKind: 'melee', rangeFt: 5, expectedDamage: 5 }]
    }]
  }).actors[0];

  assert.deepEqual(inferDefaultBehaviorProfile(actor), {
    cognition: 'trained',
    drive: 'tactical_role_objective',
    riskTolerance: 'normal',
    coordination: 'squad',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  });
  assert.deepEqual(normalizeBehaviorProfile(null, actor), inferDefaultBehaviorProfile(actor));
  assert.deepEqual(behaviorProfileForActor(actor), inferDefaultBehaviorProfile(actor));
  assert.deepEqual(actor.behavior, inferDefaultBehaviorProfile(actor));
  assert.equal(actor.tactical.coreRole, 'disciplined_blocker');
});

test('visible YAML encounter fixtures assert tactical behavior', async () => {
  const fixturePaths = [
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

test('Ossuary Gate Rite sanctuary fixture loads benchmark metadata', async () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/sanctuary-of-the-magi-2026-05-03.yaml'),
    'utf8'
  );
  const fixture = parseVisibleEncounterFixture(source);
  const monsters = fixture.encounter.actors.filter((actor) => actor.side === 'monsters');
  const monsterCounts = monsters.reduce((counts, actor) => {
    const baseName = actor.name.replace(/ [A-Z]$/, '');
    counts[baseName] = (counts[baseName] || 0) + 1;
    return counts;
  }, {});
  const mage = monsters.find((actor) => actor.name === 'Mage');
  const thug = monsters.find((actor) => actor.name === 'Thug A');
  const gargoyle = monsters.find((actor) => actor.name === 'Gargoyle A');
  const wraith = monsters.find((actor) => actor.name === 'Wraith');
  const description = fixture.description.toLowerCase();

  assert.equal(fixture.id, 'sanctuary_of_the_magi_2026_05_03');
  assert.equal(fixture.label, 'The Ossuary Gate Rite');
  assert.equal(monsterCounts.Mage, 1);
  assert.equal(monsterCounts.Thug, 2);
  assert.equal(monsterCounts.Veteran, 2);
  assert.equal(monsterCounts.Ghast, 2);
  assert.equal(monsterCounts.Gargoyle, 2);
  assert.equal(monsterCounts.Wraith, 1);
  assert.equal(monsterCounts.Goblin || 0, 0);
  assert.ok(mage);
  assert.equal(mage.spells.some((spell) => ['support', 'defensive'].includes(spell.kind)), true);
  assert.equal(mage.tactical.role, 'boss_caster');
  assert.equal(mage.tactical.authoredRole, 'boss_caster');
  assert.equal(mage.tactical.coreRole, 'support_caster');
  assert.equal(mage.tactical.protectedAsset, true);
  assert.equal(mage.tactical.objectiveRole, 'ritual_actor');
  assert.equal(thug.tactical.role, 'brute_blocker');
  assert.equal(thug.tactical.coreRole, 'disciplined_blocker');
  assert.equal(wraith.tactical.role, 'mobile_striker');
  assert.equal(wraith.tactical.coreRole, 'ambusher_bruiser');
  assert.equal(gargoyle.tactical.role, 'held_ambusher');
  assert.equal(gargoyle.tactical.coreRole, 'ambusher_bruiser');
  assert.equal(fixture.encounter.activeActorId, mage.id);
  assert.equal(fixture.encounter.activationGroups[0]?.id, 'ossuary_gate_defenders');
  assert.equal(fixture.encounter.activationGroups[0]?.actorIds.length, 10);
  assert.equal(description.includes('dyson logos'), true);
  assert.equal(description.includes('https://dysonlogos.blog/maps/commercial-maps/'), true);
  assert.equal(description.includes('https://dysonlogos.blog/wp-content/uploads/2020/11/sanctuary-of-the-magi.png'), true);
  assert.equal(description.includes('ideal_behavior'), true);
  assert.equal(description.includes('protected_asset'), true);
  assert.equal(description.includes('unsupported doctrines'), true);

  const mageOutput = await new SupervisorScriptedController().chooseAction({
    encounter: fixture.encounter,
    actorId: mage.id,
    candidateLimit: 36
  });
  assert.equal(mageOutput.logs[0].data.diagnostics.candidateSetHealth.role, 'support_caster');

  const thugOutput = await new SupervisorScriptedController().chooseAction({
    encounter: fixture.encounter,
    actorId: thug.id,
    candidateLimit: 36
  });
  assert.equal(thugOutput.logs[0].data.diagnostics.candidateSetHealth.role, 'disciplined_blocker');

  const wraithCandidates = generateCandidateActions(fixture.encounter, wraith, { limit: 36 });
  assert.equal(wraithCandidates.some((candidate) => candidate.family === 'hold_hidden'), true);
  assert.equal(wraithCandidates.some((candidate) => candidate.family === 'stalk_to_cover'), true);

  const groupOutput = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });
  const blockerDecisions = groupOutput.logs.filter((log) => {
    const actor = fixture.encounter.actors.find((entry) => entry.id === log.actorId);
    return log.phase === 'decision' && actor?.tactical?.coreRole === 'disciplined_blocker';
  });

  assert.equal(blockerDecisions.length, 4);
  for (const decision of blockerDecisions) {
    assert.notEqual(decision.data.selected.family, 'shoot_and_scoot');
    assert.ok(decision.data.selected.protectedAssetSafetyDelta);
    assert.equal(decision.data.selected.protectedAssetSafetyDelta.protectedAsset.name, 'Mage');
  }
});

test('Stony Shore Ambush fixture loads benchmark metadata', () => {
  const fixture = stonyShoreFixture();
  const monsters = fixture.encounter.actors.filter((actor) => actor.side === 'monsters');
  const monsterCounts = monsters.reduce((counts, actor) => {
    const baseName = actor.name.replace(/ [A-Z]$/, '');
    counts[baseName] = (counts[baseName] || 0) + 1;
    return counts;
  }, {});
  const dragon = monsters.find((actor) => actor.name === 'Young Black Dragon');
  const troll = monsters.find((actor) => actor.name === 'Troll A');
  const lizardfolk = monsters.find((actor) => actor.name === 'Lizardfolk A');
  const crocodile = monsters.find((actor) => actor.name === 'Giant Crocodile');
  const unsupportedFeatures = fixture.raw.known_unsupported_features_to_watch || [];
  const expectations = fixture.raw.expectations || [];
  const mustExpectations = (fixture.expected.must || []).flatMap((entry) => Object.keys(entry));
  const rawDragon = (fixture.raw.actors || []).find((actor) => actor.id === 'young_black_dragon');
  const rawTroll = (fixture.raw.actors || []).find((actor) => actor.id === 'troll_a');
  const rawLizardfolk = (fixture.raw.actors || []).find((actor) => actor.id === 'lizardfolk_a');
  const rawCrocodile = (fixture.raw.actors || []).find((actor) => actor.id === 'giant_crocodile');

  assert.equal(fixture.id, 'the_stony_shore_ambush');
  assert.equal(fixture.label, 'The Stony Shore Ambush');
  assert.equal(fixture.raw.map.name, 'The Stony Shore - Combined');
  assert.equal(fixture.raw.map.creator, 'Dyson Logos');
  assert.equal(fixture.raw.map.commercial_maps_url, 'https://dysonlogos.blog/maps/commercial-maps/');
  assert.equal(fixture.raw.map.source_urls.includes('https://dysonlogos.blog/2023/06/06/the-stony-shore-map-1/'), true);
  assert.equal(fixture.raw.map.source_urls.includes('https://dysonlogos.blog/2023/06/13/the-stony-shore-combined/'), true);
  assert.match(fixture.raw.map.attribution, /Dyson Logos/);
  assert.equal(monsterCounts['Young Black Dragon'], 1);
  assert.equal(monsterCounts.Troll, 2);
  assert.equal(monsterCounts.Lizardfolk, 4);
  assert.equal(monsterCounts['Giant Crocodile'], 1);
  assert.equal(rawDragon?.tactical?.mapped_core_role, 'ambusher_bruiser');
  assert.equal(rawCrocodile?.tactical?.mapped_core_role, 'ambusher_bruiser');
  assert.equal(rawLizardfolk?.tactical?.mapped_core_role, 'skirmisher');
  assert.equal(rawTroll?.tactical?.mapped_core_role, 'disciplined_blocker');
  assert.ok(dragon);
  assert.equal(dragon.sizeCells, 2);
  assert.equal(dragon.tactical.role, 'mobile_boss_controller');
  assert.equal(dragon.tactical.coreRole, 'ambusher_bruiser');
  assert.deepEqual(dragon.behavior, inferDefaultBehaviorProfile(dragon));
  assert.equal(dragon.tactical.objectiveRole, 'break_formation');
  assert.equal(troll.tactical.role, 'brute_blocker');
  assert.equal(troll.tactical.coreRole, 'disciplined_blocker');
  assert.deepEqual(troll.behavior, inferDefaultBehaviorProfile(troll));
  assert.equal(troll.tactical.objectiveRole, 'hold_cavern_choke');
  assert.equal(lizardfolk.tactical.role, 'skirmisher');
  assert.equal(lizardfolk.tactical.coreRole, 'skirmisher');
  assert.deepEqual(lizardfolk.behavior, inferDefaultBehaviorProfile(lizardfolk));
  assert.equal(lizardfolk.tactical.objectiveRole, 'harass_and_flank');
  assert.equal(crocodile.sizeCells, 3);
  assert.equal(crocodile.tactical.role, 'grappler_ambusher');
  assert.equal(crocodile.tactical.coreRole, 'ambusher_bruiser');
  assert.deepEqual(crocodile.behavior, inferDefaultBehaviorProfile(crocodile));
  assert.equal(crocodile.tactical.objectiveRole, 'punish_edge_movement');
  assert.equal(fixture.raw.ideal_behavior.includes('mobile boss controller'), true);
  assert.equal(unsupportedFeatures.includes('breath weapon area targeting'), true);
  assert.equal(unsupportedFeatures.includes('flight or swim movement'), true);
  assert.equal(unsupportedFeatures.includes('grapple/drag behavior for the Giant Crocodile'), true);
  assert.equal(unsupportedFeatures.includes('large-token pathing around narrow cave geometry'), true);
  assert.equal(expectations.includes('noOccupiedDestination'), true);
  assert.equal(expectations.includes('moveDoesNotCrossBlocking'), true);
  assert.equal(mustExpectations.includes('noOccupiedDestination'), true);
  assert.equal(mustExpectations.includes('moveDoesNotCrossBlocking'), true);
  assert.equal(fixture.encounter.battlefield.width, 56);
  assert.equal(fixture.encounter.battlefield.height, 24);
  assert.equal(fixture.encounter.battlefield.gridSize, 300);
  assert.ok(fixture.encounter.battlefield.edges.length > 0);
  assert.equal(fixture.encounter.activationGroups[0]?.actorIds.length, 8);
});

test('Zombie Doorway Press fixture loads metadata for future mindless behavior work', () => {
  const fixture = zombieDoorwayFixture();
  const zombies = fixture.encounter.actors.filter((actor) => actor.side === 'monsters');
  const heroes = fixture.encounter.actors.filter((actor) => actor.side === 'heroes');

  assert.equal(fixture.id, 'zombie_doorway_press_2026_05_10');
  assert.equal(fixture.label, 'Zombie Doorway Press - 2026-05-10');
  assert.equal(fixture.encounter.battlefield.width, 10);
  assert.equal(fixture.encounter.battlefield.height, 8);
  assert.equal(fixture.encounter.battlefield.gridSize, 64);
  assert.equal(fixture.encounter.battlefield.edges.length, 7);
  assert.equal(fixture.encounter.activationGroups[0]?.actorIds.length, 4);
  assert.equal(zombies.length, 4);
  assert.equal(heroes.length, 3);
  assert.equal(fixture.raw.controllers.includes('supervisor_scripted_group'), true);
  assert.match(fixture.description, /metadata-only benchmark fixture/i);
});

test('Zombie Doorway Press preserves explicit mindless zombie behavior while other actors keep defaults', () => {
  const fixture = zombieDoorwayFixture();
  const zombie = fixture.encounter.actors.find((actor) => actor.id === 'zombie_a');
  const hero = fixture.encounter.actors.find((actor) => actor.id === 'hero_a');
  const rawZombie = (fixture.raw.actors || []).find((actor) => actor.id === 'zombie_a');

  assert.ok(zombie);
  assert.equal(rawZombie?.behavior?.cognition, 'mindless');
  assert.equal(zombie.tactical.role, 'brute_blocker');
  assert.equal(zombie.tactical.coreRole, 'disciplined_blocker');
  assert.deepEqual(zombie.behavior, {
    cognition: 'mindless',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  });
  assert.ok(hero);
  assert.deepEqual(hero.behavior, inferDefaultBehaviorProfile(hero));
});

test('Wolf Pack Harrier fixture loads animal/pack behavior metadata', () => {
  const fixture = wolfPackFixture();
  const wolves = fixture.encounter.actors.filter((actor) => actor.side === 'monsters');
  const heroes = fixture.encounter.actors.filter((actor) => actor.side === 'heroes');

  assert.equal(fixture.id, 'wolf_pack_harrier_2026_05_10');
  assert.equal(fixture.label, 'Wolf Pack Harrier - 2026-05-10');
  assert.equal(fixture.encounter.battlefield.width, 12);
  assert.equal(fixture.encounter.battlefield.height, 8);
  assert.equal(fixture.encounter.battlefield.gridSize, 64);
  assert.equal(fixture.encounter.battlefield.edges.length, 7);
  assert.equal(fixture.encounter.activationGroups[0]?.actorIds.length, 4);
  assert.equal(wolves.length, 4);
  assert.equal(heroes.length, 3);
  assert.equal(fixture.raw.controllers.includes('supervisor_scripted_group'), true);
  assert.match(fixture.description, /metadata-only benchmark fixture/i);
});

test('Wolf Pack Harrier preserves explicit animal/pack behavior while default behavior remains unchanged elsewhere', () => {
  const fixture = wolfPackFixture();
  const wolf = fixture.encounter.actors.find((actor) => actor.id === 'wolf_a');
  const hero = fixture.encounter.actors.find((actor) => actor.id === 'hero_a');
  const rawWolf = (fixture.raw.actors || []).find((actor) => actor.id === 'wolf_a');
  const zombieFixture = zombieDoorwayFixture();
  const zombie = zombieFixture.encounter.actors.find((actor) => actor.id === 'zombie_a');
  const stony = stonyShoreFixture();
  const dragon = stony.encounter.actors.find((actor) => actor.id === 'young_black_dragon');

  assert.ok(wolf);
  assert.equal(rawWolf?.behavior?.cognition, 'animal');
  assert.equal(wolf.tactical.coreRole, 'skirmisher');
  assert.deepEqual(wolf.behavior, {
    cognition: 'animal',
    drive: 'isolate_weak_prey',
    riskTolerance: 'self_preserving',
    coordination: 'pack',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  });
  assert.ok(hero);
  assert.deepEqual(hero.behavior, inferDefaultBehaviorProfile(hero));
  assert.ok(zombie);
  assert.equal(zombie.behavior.cognition, 'mindless');
  assert.deepEqual(dragon.behavior, inferDefaultBehaviorProfile(dragon));
});

test('mindless behavior suppresses retreat and skirmish candidate families', () => {
  const encounter = normalizeEncounterState({
    id: 'mindless-family-gating',
    activeActorId: 'zombie_archer',
    battlefield: { width: 10, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'zombie_archer',
        name: 'Zombie Archer',
        side: 'monsters',
        cell: { x: 2, y: 3 },
        speed: 30,
        tactical: { role: 'brute_blocker', mapped_core_role: 'disciplined_blocker' },
        behavior: {
          cognition: 'mindless',
          drive: 'nearest_living_prey',
          riskTolerance: 'fearless',
          coordination: 'none',
          planningHorizon: 'immediate',
          targetStickiness: 'high'
        },
        attacks: [
          { name: 'Slam', attackKind: 'melee', rangeFt: 5, expectedDamage: 4 },
          { name: 'Shortbow', attackKind: 'ranged', rangeFt: 60, expectedDamage: 4 }
        ]
      },
      { id: 'hero_a', name: 'Hero A', side: 'heroes', cell: { x: 5, y: 3 }, speed: 30, hp: '18/18', attacks: [] },
      { id: 'hero_b', name: 'Hero B', side: 'heroes', cell: { x: 7, y: 3 }, speed: 30, hp: '8/18', attacks: [] }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 36 });

  assert.equal(candidates.some((candidate) => candidate.family === 'shoot_and_scoot'), false);
  assert.equal(candidates.some((candidate) => candidate.family === 'disengage_retreat'), false);
  assert.equal(candidates.some((candidate) => candidate.family === 'stalk_to_cover'), false);
});

test('mindless nearest-prey drive and high target stickiness prefer the adjacent target over a farther wounded one', async () => {
  const encounter = normalizeEncounterState({
    id: 'mindless-nearest-prey',
    activeActorId: 'zombie',
    battlefield: { width: 10, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'zombie',
        name: 'Zombie',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 20,
        tactical: { role: 'brute_blocker', mapped_core_role: 'disciplined_blocker' },
        behavior: {
          cognition: 'mindless',
          drive: 'nearest_living_prey',
          riskTolerance: 'fearless',
          coordination: 'none',
          planningHorizon: 'immediate',
          targetStickiness: 'high'
        },
        attacks: [{ name: 'Slam', attackKind: 'melee', rangeFt: 5, expectedDamage: 4 }]
      },
      { id: 'hero_near', name: 'Hero Near', side: 'heroes', cell: { x: 4, y: 3 }, speed: 30, hp: '20/20', attacks: [] },
      { id: 'hero_far', name: 'Hero Far', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, hp: '4/20', attacks: [] }
    ]
  });

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'zombie',
    candidateLimit: 36
  });
  const selected = output.logs[0]?.data?.selected;

  assert.equal(selected?.family, 'attack_from_current');
  assert.deepEqual(selected?.targetIds, ['hero_near']);
  assert.equal(selected?.supervisorBreakdown?.targetPriorityLowHpBonus ?? 0, 0);
  assert.equal(selected?.scoreBreakdown?.behaviorNearestPreyBonus, 6);
  assert.equal(selected?.scoreBreakdown?.behaviorTargetStickinessBonus, 4);
});

test('Zombie Doorway Press coordination:none zombies can converge on the same nearest target without squad doctrine bonuses', async () => {
  const fixture = zombieDoorwayFixture();
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });
  const decisions = (output.logs || [])
    .filter((log) => log.phase === 'decision')
    .filter((log) => ['zombie_a', 'zombie_b', 'zombie_c', 'zombie_d'].includes(log.actorId))
    .filter((log) => log.data?.selected)
    .map((log) => ({
      actorId: log.actorId,
      selected: log.data?.selected,
      breakdown: log.data?.selected?.supervisorBreakdown || {},
      scoreBreakdown: log.data?.selected?.scoreBreakdown || {}
    }));

  assert.equal(decisions.length, 4);
  const convergedOnHeroA = decisions.filter((decision) => decision.selected?.targetIds?.[0] === 'hero_a');
  assert.ok(convergedOnHeroA.length >= 2, 'expected multiple zombies to converge on the same nearest target');
  for (const decision of decisions) {
    assert.notEqual(decision.selected?.family, 'shoot_and_scoot');
    assert.notEqual(decision.selected?.family, 'disengage_retreat');
    assert.notEqual(decision.selected?.family, 'stalk_to_cover');
    assert.equal(decision.breakdown.targetPriorityGroupFocusBonus ?? 0, 0);
    assert.equal(decision.breakdown.targetPriorityMainThreatBonus ?? 0, 0);
    assert.equal(Object.keys(decision.breakdown).some((key) => key.startsWith('doctrine')), false);
    assert.notEqual(decision.selected?.targetIds?.[0], 'hero_b');
  }
  for (const decision of convergedOnHeroA) {
    assert.equal(decision.scoreBreakdown.behaviorNearestPreyBonus, 6);
  }
});

test('Stony Shore bounds include logged coordinates on the exported board', () => {
  const fixture = stonyShoreFixture();
  const { encounter } = fixture;

  assert.equal(isCellInBounds(encounter, { x: 39, y: 10 }), true);
  assert.equal(isCellInBounds(encounter, { x: 41, y: 12 }), true);
  assert.equal(isCellInBounds(encounter, { x: 56, y: 10 }), false);
  assert.equal(isCellInBounds(encounter, { x: -1, y: 10 }), false);
  assert.equal(isCellInBounds(encounter, { x: 10, y: -1 }), false);
});

test('Stony Shore group controller destinations stay within battlefield bounds', async () => {
  const fixture = stonyShoreFixture();
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });

  for (const move of output.plan?.moves || []) {
    assert.equal(
      isCellInBounds(fixture.encounter, { x: move.to?.[0], y: move.to?.[1] }),
      true,
      `expected in-bounds move destination for ${move.token}: (${move.to?.[0]},${move.to?.[1]})`
    );
  }
});

test('Stony Shore group controller preserves benchmark behavior roles', async () => {
  const fixture = stonyShoreFixture();
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });
  const actorById = new Map(fixture.encounter.actors.map((actor) => [actor.id, actor]));
  const decisions = (output.logs || [])
    .filter((log) => log.phase === 'decision' && actorById.has(log.actorId))
    .filter((log) => log.data?.selected)
    .map((log) => ({
      actor: actorById.get(log.actorId),
      selected: log.data.selected,
      diagnostics: log.data.diagnostics || {}
    }));
  const byActorId = new Map(decisions.map((entry) => [entry.actor.id, entry]));
  const lizardfolkDecisions = decisions.filter((entry) => entry.actor.name.startsWith('Lizardfolk '));
  const trollDecisions = decisions.filter((entry) => entry.actor.name.startsWith('Troll '));
  const harassmentFamilies = new Set(['shoot_and_scoot', 'move_and_attack']);

  const dragon = byActorId.get('young_black_dragon');
  assert.ok(dragon, 'expected group decision for Young Black Dragon');
  assert.equal(dragon.diagnostics.candidateSetHealth?.role, 'ambusher_bruiser');
  assert.equal(dragon.diagnostics.candidateSetHealth?.roleSource, 'tactical.mapped_core_role');
  assert.equal(dragon.diagnostics.roleCompliance?.role, 'ambusher_bruiser');
  assert.equal(dragon.diagnostics.roleCompliance?.roleSource, 'tactical.mapped_core_role');
  assert.equal(dragon.selected.family, 'shoot_and_scoot');
  assert.equal(dragon.selected.actionName, 'Acid Breath');

  assert.ok(lizardfolkDecisions.length >= 4, 'expected decisions for all lizardfolk');
  assert.ok(
    lizardfolkDecisions.some((entry) => entry.selected.family === 'shoot_and_scoot'),
    'expected at least one lizardfolk to use shoot_and_scoot harassment'
  );
  for (const decision of lizardfolkDecisions) {
    assert.equal(decision.diagnostics.candidateSetHealth?.role, 'skirmisher');
    assert.equal(decision.diagnostics.candidateSetHealth?.roleSource, 'tactical.mapped_core_role');
    assert.equal(decision.diagnostics.roleCompliance?.role, 'skirmisher');
    assert.equal(decision.diagnostics.roleCompliance?.roleSource, 'tactical.mapped_core_role');
    assert.equal(harassmentFamilies.has(decision.selected.family), true, `${decision.actor.name} should use harassment-compatible family`);
    assert.equal(decision.selected.actionName, 'Javelin');
  }

  assert.equal(trollDecisions.length, 2);
  for (const decision of trollDecisions) {
    assert.equal(decision.diagnostics.candidateSetHealth?.role, 'disciplined_blocker');
    assert.equal(decision.diagnostics.candidateSetHealth?.roleSource, 'tactical.mapped_core_role');
    assert.equal(decision.diagnostics.roleCompliance?.role, 'disciplined_blocker');
    assert.equal(decision.diagnostics.roleCompliance?.roleSource, 'tactical.mapped_core_role');
    assert.equal(decision.selected.family, 'move_and_attack');
    assert.equal(['Claw', 'Bite'].includes(decision.selected.actionName), true);
  }

  const crocodile = byActorId.get('giant_crocodile');
  assert.ok(crocodile, 'expected group decision for Giant Crocodile');
  assert.equal(crocodile.diagnostics.candidateSetHealth?.role, 'ambusher_bruiser');
  assert.equal(crocodile.diagnostics.candidateSetHealth?.roleSource, 'tactical.mapped_core_role');
  assert.equal(crocodile.diagnostics.roleCompliance?.role, 'ambusher_bruiser');
  assert.equal(crocodile.diagnostics.roleCompliance?.roleSource, 'tactical.mapped_core_role');
  assert.equal(crocodile.selected.family, 'hold_hidden');
  assert.equal(crocodile.selected.actionName, 'hold_hidden');
  assert.equal(crocodile.diagnostics.candidateSetHealth?.status, 'warning');
  assert.equal(crocodile.diagnostics.roleCompliance?.status, 'warning');
  assert.deepEqual(
    crocodile.diagnostics.candidateSetHealth?.missingExpectedCandidates,
    ['intercept_flanker', 'attack_isolated_target', 'move_and_attack']
  );
  assert.deepEqual(
    crocodile.diagnostics.candidateSetHealth?.unsupportedExpectedCandidates,
    ['intercept_flanker']
  );
});

test('Stony Shore exported blocking edges still block movement while nearby gaps stay open', () => {
  const fixture = stonyShoreFixture();
  const { encounter } = fixture;

  assert.equal(hasBlockedMovementPath(encounter, { x: 3, y: 7 }, { x: 3, y: 8 }), true);
  assert.equal(hasBlockedMovementPath(encounter, { x: 4, y: 7 }, { x: 4, y: 8 }), false);
});

test('Stony Shore crocodile warning reflects scenario limits rather than a broken large-ambusher generator', () => {
  const fixture = stonyShoreFixture();
  const crocodile = fixture.encounter.actors.find((actor) => actor.id === 'giant_crocodile');
  const heroes = fixture.encounter.actors.filter((actor) => actor.side === 'heroes');
  const candidates = generateCandidateActions(fixture.encounter, crocodile, { limit: 36 });
  const families = new Set(candidates.map((candidate) => candidate.family));

  assert.equal(families.has('move_and_attack'), false);
  assert.equal(families.has('attack_isolated_target'), false);
  assert.equal(families.has('intercept_flanker'), false);
  assert.equal(families.has('advance_to_attack'), true);
  assert.equal(
    heroes.some((hero) => candidates.some((candidate) => candidate.family === 'attack_isolated_target' && candidate.targetIds.includes(hero.id))),
    false
  );
});

test('group controller preserves direct tactical coreRole on live-token-shaped actors', async () => {
  const encounter = normalizeEncounterState({
    activeActorId: 'dragon',
    activationGroups: [{
      id: 'monsters',
      actorIds: ['dragon', 'crocodile', 'lizardfolk', 'troll'],
      activationMode: 'coordinated_sequential'
    }],
    battlefield: {
      width: 12,
      height: 8,
      gridSize: 64,
      edges: [],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'dragon',
        name: 'Young Black Dragon',
        side: 'monsters',
        cell: { x: 1, y: 1 },
        speed: 40,
        tactical: { role: 'mobile_boss_controller', coreRole: 'ambusher_bruiser' },
        attacks: [{ name: 'Acid Breath', attackKind: 'ranged', rangeFt: 60, expectedDamage: 20 }]
      },
      {
        id: 'crocodile',
        name: 'Giant Crocodile',
        side: 'monsters',
        cell: { x: 1, y: 3 },
        speed: 30,
        tactical: { role: 'grappler_ambusher', coreRole: 'ambusher_bruiser' },
        attacks: [{ name: 'Bite', attackKind: 'melee', rangeFt: 5, expectedDamage: 12 }]
      },
      {
        id: 'lizardfolk',
        name: 'Lizardfolk A',
        side: 'monsters',
        cell: { x: 1, y: 5 },
        speed: 30,
        tactical: { role: 'mobile_harasser', coreRole: 'skirmisher' },
        attacks: [{ name: 'Javelin', attackKind: 'ranged', rangeFt: 30, expectedDamage: 5 }]
      },
      {
        id: 'troll',
        name: 'Troll A',
        side: 'monsters',
        cell: { x: 1, y: 6 },
        speed: 30,
        tactical: { role: 'brute_blocker', coreRole: 'disciplined_blocker' },
        attacks: [{ name: 'Claw', attackKind: 'melee', rangeFt: 5, expectedDamage: 8 }]
      },
      {
        id: 'hero_a',
        name: 'Hero A',
        side: 'heroes',
        cell: { x: 8, y: 1 },
        speed: 30,
        attacks: [{ name: 'Longsword', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 }]
      },
      {
        id: 'hero_b',
        name: 'Hero B',
        side: 'heroes',
        cell: { x: 8, y: 3 },
        speed: 30,
        attacks: [{ name: 'Longsword', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 }]
      }
    ]
  });
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter,
    activationGroup: encounter.activationGroups[0],
    candidateLimit: 24
  });
  const decisionLogs = new Map(
    output.logs
      .filter((log) => log.phase === 'decision')
      .map((log) => [log.actorId, log])
  );

  assert.equal(decisionLogs.get('dragon')?.data?.diagnostics?.candidateSetHealth?.role, 'ambusher_bruiser');
  assert.equal(decisionLogs.get('dragon')?.data?.diagnostics?.candidateSetHealth?.roleSource, 'tactical.coreRole');
  assert.equal(decisionLogs.get('crocodile')?.data?.diagnostics?.candidateSetHealth?.role, 'ambusher_bruiser');
  assert.equal(decisionLogs.get('crocodile')?.data?.diagnostics?.candidateSetHealth?.roleSource, 'tactical.coreRole');
  assert.equal(decisionLogs.get('lizardfolk')?.data?.diagnostics?.candidateSetHealth?.role, 'skirmisher');
  assert.equal(decisionLogs.get('lizardfolk')?.data?.diagnostics?.candidateSetHealth?.roleSource, 'tactical.coreRole');
  assert.equal(decisionLogs.get('troll')?.data?.diagnostics?.candidateSetHealth?.role, 'disciplined_blocker');
  assert.equal(decisionLogs.get('troll')?.data?.diagnostics?.candidateSetHealth?.roleSource, 'tactical.coreRole');
});

test('visible fixture actors without tactical metadata keep inferred roles', async () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/bandit-doorway-ambush-2026-04-26.yaml'),
    'utf8'
  );
  const fixture = parseVisibleEncounterFixture(source);
  const actor = fixture.encounter.actors.find((entry) => entry.id === fixture.encounter.activeActorId);

  assert.equal(actor.tactical.role, '');
  assert.equal(actor.tactical.coreRole, '');

  const output = await new SupervisorScriptedController().chooseAction({
    encounter: fixture.encounter,
    actorId: actor.id,
    candidateLimit: 36
  });
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'skirmisher');
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
