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
  getController,
  behaviorProfileForActor,
  hasBlockedMovementPath,
  hasLineOfSight,
  inferDefaultBehaviorProfile,
  normalizeEncounterState,
  normalizeBehaviorProfile,
  scoreCandidate,
  tacticalOutputToVttPlan,
  validateEncounterState
} from '../../packages/tactical-ai-core/src/index.js';
import {
  EXAMPLE_MONSTER_PROFILES,
  SAMPLE_ENCOUNTER_FIXTURES,
  normalizeMonsterProfile,
  srdMonsterTacticalOverride,
  parseVisibleEncounterFixture
} from '../../packages/tactical-ai-content/src/index.js';
import { validateAction as validateVttAction } from '../ai-turn-eval-utils.mjs';
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

function occupiedCellsForTest(actor = {}, fromCell = null) {
  const origin = fromCell || actor.cell || { x: 0, y: 0 };
  const size = Math.max(1, Math.round(Number(actor?.sizeCells) || 1));
  const cells = [];
  for (let dx = 0; dx < size; dx += 1) {
    for (let dy = 0; dy < size; dy += 1) {
      cells.push({ x: origin.x + dx, y: origin.y + dy });
    }
  }
  return cells;
}

function destinationOverlapsActor(actor = {}, destination = null, other = {}) {
  const a = new Set(occupiedCellsForTest(actor, destination).map((cell) => `${cell.x},${cell.y}`));
  return occupiedCellsForTest(other, other.cell).some((cell) => a.has(`${cell.x},${cell.y}`));
}

function pathContainsCell(path = [], cell = null) {
  const x = Number(cell?.x);
  const y = Number(cell?.y);
  return (Array.isArray(path) ? path : []).some((step) => Number(step?.x) === x && Number(step?.y) === y);
}

function assertContiguousPath(path = [], start = null) {
  const cells = [start, ...(Array.isArray(path) ? path : [])].filter(Boolean);
  for (let index = 1; index < cells.length; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    const dx = Math.abs(Number(current.x) - Number(previous.x));
    const dy = Math.abs(Number(current.y) - Number(previous.y));
    assert.ok(dx <= 1 && dy <= 1 && (dx + dy) > 0, `expected adjacent path steps but saw (${previous.x},${previous.y}) -> (${current.x},${current.y})`);
  }
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

function sinkholeWatchFixture() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/the-sinkhole-watch-2026-04-29.yaml'),
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

test('broad tactical roles normalize directly', () => {
  for (const role of ['blocker', 'striker', 'skirmisher', 'caster', 'leader', 'lurker', 'artillery', 'swarm', 'solo', 'hazard']) {
    const encounter = normalizeEncounterState({
      id: `role-${role}`,
      battlefield: { width: 4, height: 4, edges: [], tiles: [], interactables: [] },
      actors: [{ id: 'actor', name: 'Actor', side: 'monsters', cell: { x: 1, y: 1 }, tactical: { role }, attacks: [] }]
    });
    assert.equal(encounter.actors[0].tactical.role, role);
  }
});

test('tactical function, intent, and tags normalize without closed-list validation', () => {
  const encounter = {
    id: 'function-normalization',
    battlefield: { width: 4, height: 4, edges: [], tiles: [], interactables: [] },
    actors: [{
      id: 'mage',
      name: 'Mage',
      side: 'monsters',
      cell: { x: 1, y: 1 },
      tactical: {
        role: 'caster',
        function: 'weird_future_function',
        intent: ['control_battlefield', 'preserve_self'],
        tags: ['fragile', 'area_effects']
      },
      attacks: []
    }]
  };
  const validation = validateEncounterState(encounter);
  assert.equal(validation.ok, true);
  assert.equal(validation.encounter.actors[0].tactical.function, 'weird_future_function');
  assert.deepEqual(validation.encounter.actors[0].tactical.intent, ['control_battlefield', 'preserve_self']);
  assert.deepEqual(validation.encounter.actors[0].tactical.tags, ['fragile', 'area_effects']);
});

test('single string tactical intent normalizes to an array', () => {
  const encounter = normalizeEncounterState({
    id: 'single-intent',
    battlefield: { width: 4, height: 4, edges: [], tiles: [], interactables: [] },
    actors: [{
      id: 'guard',
      name: 'Guard',
      side: 'monsters',
      cell: { x: 1, y: 1 },
      tactical: { role: 'blocker', function: 'hold_line', intent: 'hold_line' },
      attacks: []
    }]
  });
  assert.deepEqual(encounter.actors[0].tactical.intent, ['hold_line']);
});

test('invalid tactical role and secondary roles fail validation', () => {
  const invalidRole = validateEncounterState({
    id: 'invalid-role',
    battlefield: { width: 4, height: 4, edges: [], tiles: [], interactables: [] },
    actors: [{ id: 'actor', name: 'Actor', side: 'monsters', cell: { x: 1, y: 1 }, tactical: { role: 'invalid_legacy_role' }, attacks: [] }]
  });
  assert.equal(invalidRole.ok, false);
  assert.match(invalidRole.issues.join('\n'), /invalid tactical\.role/);

  const invalidSecondary = validateEncounterState({
    id: 'invalid-secondary',
    battlefield: { width: 4, height: 4, edges: [], tiles: [], interactables: [] },
    actors: [{
      id: 'dragon',
      name: 'Dragon',
      side: 'monsters',
      cell: { x: 1, y: 1 },
      tactical: { role: 'solo', secondaryRoles: ['caster', 'invalid_legacy_role'] },
      attacks: []
    }]
  });
  assert.equal(invalidSecondary.ok, false);
  assert.match(invalidSecondary.issues.join('\n'), /invalid tactical\.secondaryRoles/);
});

test('unsupported tactical provenance fields fail validation', () => {
  const unsupportedField = `mapped_${'core'}_role`;
  const result = validateEncounterState({
    id: 'unsupported-field',
    battlefield: { width: 4, height: 4, edges: [], tiles: [], interactables: [] },
    actors: [{
      id: 'actor',
      name: 'Actor',
      side: 'monsters',
      cell: { x: 1, y: 1 },
      tactical: { role: 'blocker', [unsupportedField]: 'blocker' },
      attacks: []
    }]
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), new RegExp(`unsupported tactical field: ${unsupportedField}`));
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

test('supervised utility single ranks candidates through the same output contract', async () => {
  const encounter = SAMPLE_ENCOUNTER_FIXTURES[0].encounter;
  const output = await new SupervisorScriptedController().chooseAction({ encounter });
  const plan = tacticalOutputToVttPlan(output);

  assert.equal(output.controllerId, 'supervised_utility_single');
  assert.equal(plan._controller.id, 'supervised_utility_single');
  assert.equal(plan.actions[0].type, 'attack');
  assert.ok(output.logs[0].data.supervisor.testedCandidateCount > 0);
  assert.match(output.logs[0].message, /Supervised Utility selected/);
  assert.equal(output.logs[0].data.supervisor.baseControllerId, 'utility_baseline');
});

test('supervised utility group emits one combined VTT plan for grouped actors', async () => {
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

  assert.equal(output.controllerId, 'supervised_utility_group');
  assert.equal(plan.groupedPlan.length, 2);
  assert.equal(plan.actions.length, 2);
  assert.equal(plan._controller.id, 'supervised_utility_group');
  assert.match(output.logs[0].message, /supervised 2 grouped activations/);
  assert.ok(output.logs[0].data.battlefieldAssessment.doctrine);
  assert.ok(output.logs[0].data.doctrineActionTension.status);
  assert.match(output.logs[0].data.doctrineInfluence.note, /(doctrine modifiers|only protect_caster has explicit doctrine score modifiers)/);
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

test('grouped controller keeps both compound attacker and moving spellcaster plans', async () => {
  const encounter = normalizeEncounterState({
    id: 'grouped-compound-spell',
    round: 1,
    activeActorId: 'goblin-a',
    activationGroups: [{
      id: 'group',
      actorIds: ['goblin-a', 'mage'],
      activationMode: 'coordinated_sequential'
    }],
    battlefield: {
      gridSize: 64,
      width: 12,
      height: 12,
      edges: [{ orientation: 'horizontal', x: 7, y: 1 }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'goblin-a',
        name: 'Goblin A',
        side: 'monsters',
        cell: { x: 6, y: 3 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }],
        tactical: { role: 'skirmisher', function: 'ranged_harrier' }
      },
      {
        id: 'mage',
        name: 'Mage',
        side: 'monsters',
        cell: { x: 4, y: 0 },
        speed: 30,
        attacks: [{ name: 'Dagger', attackKind: 'melee', rangeFt: 5, expectedDamage: 2 }],
        spells: [{
          name: 'Cone of Cold',
          kind: 'damage',
          target: 'enemy',
          rangeFt: 60,
          expectedValue: 30,
          requiresLineOfSight: true
        }],
        tactical: { role: 'caster', function: 'control', secondaryRoles: ['artillery'] }
      },
      { id: 'aria', name: 'Aria', side: 'heroes', cell: { x: 8, y: 4 }, speed: 30, attacks: [] }
    ]
  });

  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter,
    actorId: encounter.activeActorId,
    activationGroup: encounter.activationGroups[0],
    candidateLimit: 24
  });
  const plan = tacticalOutputToVttPlan(output);

  assert.match(output.selectedCandidateId, /^shoot_and_scoot:.*\|move_and_spell:/);
  assert.equal(plan.groupedPlan.length, 2);

  const goblinPlan = plan.groupedPlan.find((entry) => entry.actorId === 'goblin-a');
  const magePlan = plan.groupedPlan.find((entry) => entry.actorId === 'mage');
  assert.ok(goblinPlan);
  assert.ok(magePlan);

  assert.equal(goblinPlan.steps.some((step) => step.type === 'attack' && step.details === 'Shortbow'), true);
  assert.equal(goblinPlan.steps.some((step) => step.type === 'move' && step.purpose === 'hide_position'), true);
  assert.deepEqual(
    goblinPlan.steps.find((step) => step.type === 'attack')?.from,
    [6, 3]
  );

  assert.equal(magePlan.steps.some((step) => step.type === 'move'), true);
  assert.equal(magePlan.steps.some((step) => step.type === 'spell' && step.details === 'Cone of Cold'), true);
  assert.deepEqual(
    magePlan.steps.find((step) => step.type === 'spell')?.from,
    [3, 0]
  );

  assert.equal(plan.steps.some((step) => step.token === 'Goblin A' && step.type === 'attack'), true);
  assert.equal(plan.actions.some((action) => action.token === 'Mage' && action.type === 'spell' && action.details === 'Cone of Cold'), true);

  const mageSpellLog = output.logs.find((entry) => entry.actorId === 'mage' && /Cone of Cold is modeled as single_target/.test(entry.message));
  assert.ok(mageSpellLog);
});

test('grouped controller does not route an earlier actor through a later ally start cell', async () => {
  const encounter = normalizeEncounterState({
    id: 'grouped-transit-occupancy',
    round: 1,
    activeActorId: 'goblin-a',
    activationGroups: [{
      id: 'group',
      actorIds: ['goblin-a', 'mage'],
      activationMode: 'coordinated_sequential'
    }],
    battlefield: {
      gridSize: 64,
      width: 12,
      height: 8,
      edges: [],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'goblin-a',
        name: 'Goblin A',
        side: 'monsters',
        cell: { x: 4, y: 3 },
        speed: 30,
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }],
        tactical: { role: 'skirmisher', function: 'ranged_harrier' },
        behavior: { cognition: 'trained', coordination: 'squad' }
      },
      {
        id: 'mage',
        name: 'Mage',
        side: 'monsters',
        cell: { x: 4, y: 2 },
        speed: 30,
        attacks: [{ name: 'Dagger', attackKind: 'melee', rangeFt: 5, expectedDamage: 2 }],
        tactical: { role: 'striker', function: 'brute' },
        behavior: { cognition: 'trained', coordination: 'squad' }
      },
      {
        id: 'aria',
        name: 'Aria',
        side: 'heroes',
        cell: { x: 9, y: 1 },
        speed: 30,
        attacks: []
      }
    ]
  });

  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter,
    actorId: encounter.activeActorId,
    activationGroup: encounter.activationGroups[0],
    candidateLimit: 24
  });
  const plan = tacticalOutputToVttPlan(output);
  const goblinPlan = plan.groupedPlan.find((entry) => entry.actorId === 'goblin-a');
  const magePlan = plan.groupedPlan.find((entry) => entry.actorId === 'mage');

  assert.ok(goblinPlan);
  assert.ok(magePlan);

  const goblinMoveSteps = goblinPlan.steps.filter((step) => step.type === 'move');
  for (const step of goblinMoveSteps) {
    const normalizedPath = (step.path || []).map((cell) => ({ x: Number(cell[0]), y: Number(cell[1]) }));
    assert.equal(pathContainsCell(normalizedPath, { x: 4, y: 2 }), false);
    assertContiguousPath(normalizedPath, { x: 4, y: 3 });
  }

  const mageMoveStep = magePlan.steps.find((step) => step.type === 'move');
  if (mageMoveStep) {
    const normalizedPath = (mageMoveStep.path || []).map((cell) => ({ x: Number(cell[0]), y: Number(cell[1]) }));
    assertContiguousPath(normalizedPath, { x: 4, y: 2 });
  }
});

test('controller registry resolves canonical and legacy supervised utility ids to the same plan shape', async () => {
  const encounter = SAMPLE_ENCOUNTER_FIXTURES[0].encounter;
  const registry = createControllerRegistry();
  const canonicalSingle = getController('supervised_utility_single', registry);
  const canonicalGroup = getController('supervised_utility_group', registry);
  const legacySingle = getController('supervisor_scripted_single', registry);
  const legacyGroup = getController('supervisor_scripted_group', registry);

  assert.equal(canonicalSingle.id, 'supervised_utility_single');
  assert.equal(canonicalGroup.id, 'supervised_utility_group');
  assert.equal(legacySingle, canonicalSingle);
  assert.equal(legacyGroup, canonicalGroup);

  const canonicalOutput = await canonicalSingle.chooseAction({ encounter });
  const legacyOutput = await legacySingle.chooseAction({ encounter });
  assert.deepEqual(
    Object.keys(tacticalOutputToVttPlan(canonicalOutput)),
    Object.keys(tacticalOutputToVttPlan(legacyOutput))
  );
  assert.equal(canonicalOutput.controllerId, 'supervised_utility_single');
  assert.equal(legacyOutput.controllerId, 'supervised_utility_single');
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

test('1x1 melee move_and_attack chooses an adjacent unoccupied destination instead of the target cell', () => {
  const encounter = normalizeEncounterState({
    id: 'melee-move-attack-adjacent-stop',
    round: 1,
    activeActorId: 'vrockling',
    battlefield: { gridSize: 64, width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'vrockling',
        name: 'Vrockling',
        side: 'monsters',
        cell: { x: 0, y: 0 },
        speed: 30,
        sizeCells: 1,
        attacks: [{ name: 'Beak', attackKind: 'melee', rangeFt: 5, expectedDamage: 8 }]
      },
      {
        id: 'aria',
        name: 'Aria',
        side: 'heroes',
        cell: { x: 2, y: 0 },
        speed: 30,
        sizeCells: 1,
        attacks: []
      }
    ]
  });

  const actor = encounter.actors[0];
  const target = encounter.actors[1];
  const moveAttackCandidates = generateCandidateActions(encounter, actor, { limit: 24 })
    .filter((candidate) => candidate.family === 'move_and_attack' && candidate.action?.attackKind === 'melee');

  assert.ok(moveAttackCandidates.length > 0, 'expected at least one melee move_and_attack candidate');
  for (const candidate of moveAttackCandidates) {
    assert.notDeepEqual(candidate.move?.to, target.cell);
    assert.equal(destinationOverlapsActor(actor, candidate.move?.to, target), false);
    assert.ok(Math.max(
      Math.abs(candidate.move.to.x - target.cell.x),
      Math.abs(candidate.move.to.y - target.cell.y)
    ) <= 1);
  }
});

test('selected scripted melee move_and_attack candidates always end on an unoccupied destination', async () => {
  const encounter = normalizeEncounterState({
    id: 'selected-melee-destination-legal',
    round: 1,
    activeActorId: 'ghoul',
    battlefield: { gridSize: 64, width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'ghoul',
        name: 'Ghoul',
        side: 'monsters',
        cell: { x: 0, y: 0 },
        speed: 30,
        attacks: [{ name: 'Claw', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 }]
      },
      {
        id: 'aria',
        name: 'Aria',
        side: 'heroes',
        cell: { x: 2, y: 0 },
        speed: 30,
        attacks: []
      },
      {
        id: 'ally',
        name: 'Zombie Ally',
        side: 'monsters',
        cell: { x: 4, y: 4 },
        speed: 20,
        attacks: []
      }
    ]
  });

  const output = await new ScriptedController().chooseAction({ encounter });
  assert.match(output.selectedCandidateId, /^move_and_attack:/);
  const selected = output.candidates.find((candidate) => candidate.id === output.selectedCandidateId);
  assert.ok(selected);
  assert.ok(selected?.move?.to);
  const movingActor = encounter.actors.find((entry) => entry.id === selected.actorId);
  for (const actor of encounter.actors.filter((entry) => entry.id !== selected.actorId)) {
    assert.equal(destinationOverlapsActor(movingActor, selected.move.to, actor), false);
  }
});

test('no illegal melee move_and_attack is emitted against a target whose adjacent attack-origin cells are all blocked or occupied', () => {
  const encounter = normalizeEncounterState({
    id: 'no-legal-melee-origin-cells',
    round: 1,
    activeActorId: 'ghoul',
    battlefield: { gridSize: 64, width: 6, height: 6, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'ghoul',
        name: 'Ghoul',
        side: 'monsters',
        cell: { x: 0, y: 0 },
        speed: 30,
        attacks: [{ name: 'Claw', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 }]
      },
      { id: 'aria', name: 'Aria', side: 'heroes', cell: { x: 2, y: 2 }, speed: 30, attacks: [] },
      { id: 'hero_b', name: 'Hero B', side: 'heroes', cell: { x: 1, y: 2 }, speed: 30, attacks: [] },
      { id: 'hero_c', name: 'Hero C', side: 'heroes', cell: { x: 2, y: 1 }, speed: 30, attacks: [] },
      { id: 'hero_d', name: 'Hero D', side: 'heroes', cell: { x: 3, y: 2 }, speed: 30, attacks: [] },
      { id: 'hero_e', name: 'Hero E', side: 'heroes', cell: { x: 2, y: 3 }, speed: 30, attacks: [] },
      { id: 'hero_f', name: 'Hero F', side: 'heroes', cell: { x: 1, y: 1 }, speed: 30, attacks: [] },
      { id: 'hero_g', name: 'Hero G', side: 'heroes', cell: { x: 3, y: 1 }, speed: 30, attacks: [] },
      { id: 'hero_h', name: 'Hero H', side: 'heroes', cell: { x: 1, y: 3 }, speed: 30, attacks: [] },
      { id: 'hero_i', name: 'Hero I', side: 'heroes', cell: { x: 3, y: 3 }, speed: 30, attacks: [] }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 36 });
  const moveAttackCandidates = candidates.filter((candidate) =>
    candidate.family === 'move_and_attack' &&
    candidate.action?.attackKind === 'melee' &&
    candidate.targetIds?.includes('aria')
  );
  assert.equal(moveAttackCandidates.length, 0);
});

test('large melee move_and_attack uses an adjacent unoccupied origin instead of the target cell', () => {
  const encounter = normalizeEncounterState({
    id: 'vrock-like-occupied-target-cell',
    round: 1,
    activeActorId: 'vrock',
    battlefield: { gridSize: 64, width: 14, height: 12, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'vrock',
        name: 'Vrock',
        side: 'monsters',
        cell: { x: 4, y: 6 },
        sizeCells: 2,
        speed: 40,
        attacks: [{ name: 'Beak', attackKind: 'melee', rangeFt: 5, expectedDamage: 10 }]
      },
      {
        id: 'aria',
        name: 'Aria',
        side: 'heroes',
        cell: { x: 8, y: 6 },
        sizeCells: 1,
        speed: 30,
        attacks: []
      }
    ]
  });

  const actor = encounter.actors[0];
  const target = encounter.actors[1];
  const candidates = generateCandidateActions(encounter, actor, { limit: 36 });
  const moveAttackCandidates = candidates.filter((candidate) => candidate.family === 'move_and_attack' && candidate.action?.details === 'Beak');

  assert.ok(moveAttackCandidates.length > 0, 'expected at least one Vrock-like move_and_attack candidate');
  assert.equal(moveAttackCandidates.some((candidate) => candidate.move?.to?.x === 8 && candidate.move?.to?.y === 6), false);
  for (const candidate of moveAttackCandidates) {
    assert.equal(destinationOverlapsActor(actor, candidate.move?.to, target), false);
  }
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
        tactical: { role: 'blocker' },
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
        tactical: { role: 'blocker' },
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
        tactical: { role: 'blocker' },
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
        tactical: { role: 'caster', protectedAsset: true },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }]
      },
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'blocker' },
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
  assert.equal(veteranDecision.data.diagnostics.candidateSetHealth.role, 'blocker');
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

test('shoot-and-scoot plan preserves firing cell before final hide cell', async () => {
  const encounter = normalizeEncounterState({
    id: 'shoot-scoot-firing-origin',
    activeActorId: 'goblin',
    battlefield: {
      width: 12,
      height: 8,
      edges: [{ orientation: 'h', x: 7, y: 1, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'goblin',
        name: 'Goblin A',
        side: 'monsters',
        cell: { x: 6, y: 3 },
        speed: 30,
        tactical: { role: 'skirmisher', function: 'ranged_harrier' },
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'aria', name: 'Aria', side: 'heroes', cell: { x: 8, y: 4 }, speed: 30, attacks: [] }
    ]
  });
  const goblin = encounter.actors[0];
  const candidates = generateCandidateActions(encounter, goblin, { limit: 200 });
  const candidate = candidates.find((entry) =>
    entry.family === 'shoot_and_scoot' &&
    entry.metadata?.hideCell?.x === 7 &&
    entry.metadata?.hideCell?.y === 0
  );

  assert.ok(candidate, 'expected shoot_and_scoot to hide at (7,0)');
  assert.deepEqual(candidate.fromCell, candidate.action.from);
  assert.equal(candidate.move.to.x, 7);
  assert.equal(candidate.move.to.y, 0);
  assert.equal(candidate.moveSteps <= Math.floor(goblin.speed / 5), true);

  const output = await new HumanController().chooseAction({
    encounter,
    selectedAction: candidate
  });
  const plan = tacticalOutputToVttPlan(output);
  assert.equal(plan.steps.at(-2).type, 'attack');
  assert.deepEqual(plan.steps.at(-2).from, [candidate.action.from.x, candidate.action.from.y]);
  assert.equal(plan.steps.at(-1).type, 'move');
  assert.deepEqual(plan.steps.at(-1).to, [7, 0]);

  const stateAtHideCell = {
    gridSize: 64,
    snapMode: 'topleft',
    currentTurnTokenId: 'goblin',
    blockingEdges: ['h:7,1'],
    tokens: [
      {
        id: 'goblin',
        name: 'Goblin A',
        type: 'Monster',
        x: 7 * 64,
        y: 0,
        sizeCells: 1,
        speed: 30,
        statblock: '- Shortbow: Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 piercing damage.'
      },
      { id: 'aria', name: 'Aria', type: 'PC', x: 8 * 64, y: 4 * 64, sizeCells: 1, speed: 30 }
    ]
  };
  const attack = { token: 'Goblin A', type: 'attack', target: 'Aria', details: 'Shortbow', attack_kind: 'ranged', range_ft: 80, from: [8, 0] };
  assert.equal(validateVttAction(stateAtHideCell, attack).ok, true);
  assert.equal(validateVttAction(stateAtHideCell, { ...attack, from: undefined }).ok, false);
});

test('shoot-and-scoot is not emitted for a firing cell without line of sight', () => {
  const encounter = normalizeEncounterState({
    id: 'shoot-scoot-illegal-firing-origin',
    activeActorId: 'goblin',
    battlefield: {
      width: 12,
      height: 8,
      edges: [{ orientation: 'h', x: 8, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'goblin',
        name: 'Goblin A',
        side: 'monsters',
        cell: { x: 6, y: 3 },
        speed: 30,
        tactical: { role: 'skirmisher', function: 'ranged_harrier' },
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'aria', name: 'Aria', side: 'heroes', cell: { x: 8, y: 4 }, speed: 30, attacks: [] }
    ]
  });
  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 200 });
  assert.equal(candidates.some((entry) =>
    entry.family === 'shoot_and_scoot' &&
    entry.action?.from?.x === 8 &&
    entry.action?.from?.y === 0
  ), false);
});

test('candidate bounds audit stays clean for ranged candidates near the map edge', async () => {
  const encounter = normalizeEncounterState({
    id: 'edge-bounds-audit',
    activeActorId: 'archer',
    battlefield: { width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'archer',
        name: 'Archer',
        side: 'monsters',
        cell: { x: 0, y: 3 },
        speed: 30,
        tactical: { role: 'skirmisher', function: 'ranged_harrier' },
        attacks: [{ name: 'Shortbow', attackKind: 'ranged', rangeFt: 80, expectedDamage: 5 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] }
    ]
  });
  const actor = encounter.actors[0];
  const candidates = generateCandidateActions(encounter, actor, { limit: 48 });
  for (const candidate of candidates) {
    for (const location of [
      candidate.fromCell,
      candidate.move?.to,
      candidate.action?.from,
      candidate.metadata?.attackCell,
      candidate.metadata?.hideCell,
      ...(candidate.move?.path || []),
      ...(candidate.metadata?.attackPath || []),
      ...(candidate.metadata?.postAttackPath || [])
    ].filter(Boolean)) {
      assert.equal(isCellInBounds(encounter, location), true, `${candidate.id} should stay in bounds at ${location.x},${location.y}`);
    }
  }

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'archer',
    candidateLimit: 36
  });
  const decision = output.logs[0].data;
  assert.equal(decision.diagnostics.candidateBoundsAudit.outOfBoundsCellCount, 0);
  assert.equal(decision.diagnostics.candidateBoundsAudit.selectedOutOfBounds, false);
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
        tactical: { role: 'caster', protectedAsset: true },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }]
      },
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'blocker' },
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
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'blocker');
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
        tactical: { role: 'caster', protectedAsset: true },
        spells: [{ name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 }]
      },
      {
        id: 'veteran',
        name: 'Veteran',
        side: 'monsters',
        cell: { x: 3, y: 2 },
        speed: 30,
        tactical: { role: 'blocker' },
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
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'blocker');
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerShootAndScootBonusOffset, -4);
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerAbandonsLinePenalty, undefined);
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.roleBlockerScreenBonus, 3);
  assert.equal(output.logs[0].data.selected.supervisorBreakdown.doctrineBlockerLaneBonus, 2);
  assert.match(output.logs[0].data.selected.protectedAssetSafetyDelta.assessment, /^(improves|preserves)$/);
  assert.equal(output.logs[0].data.selected.protectedAssetSafetyDelta.maintainsProtectedScreen, true);
});

test('blocker ranged skirmish movement without an authored defended objective is classified as ambiguous rather than illegal', async () => {
  const encounter = normalizeEncounterState({
    id: 'blocker-ambiguous-line',
    activeActorId: 'hobgoblin',
    battlefield: {
      width: 10,
      height: 7,
      edges: [{ orientation: 'h', x: 4, y: 2, blocksMovement: false, blocksLineOfSight: true }],
      tiles: [],
      interactables: []
    },
    actors: [
      {
        id: 'hobgoblin',
        name: 'Hobgoblin',
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'blocker', function: 'hold_line' },
        attacks: [{ name: 'Longbow', attackKind: 'ranged', rangeFt: 150, expectedDamage: 6 }]
      },
      { id: 'hero', name: 'Hero', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, attacks: [] }
    ]
  });

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'hobgoblin',
    candidateLimit: 36
  });
  const roleCompliance = output.logs[0].data.diagnostics.roleCompliance;

  assert.match(output.selectedCandidateId, /^shoot_and_scoot:/);
  assert.equal(roleCompliance.role, 'blocker');
  assert.equal(roleCompliance.function, 'hold_line');
  assert.equal(roleCompliance.status, 'weak_pass');
  assert.equal(roleCompliance.classification, 'mapping_or_fixture_ambiguous');
  assert.match(roleCompliance.concern, /no explicit defended asset or objective/i);
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
        tactical: { role: 'lurker', function: 'lurker' },
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

test('content normalization parses zombie statblocks without emitting Senses as an attack', () => {
  const profile = normalizeMonsterProfile({
    id: 'zombie',
    name: 'Zombie',
    statblock: [
      'Armor Class 8',
      'Hit Points 22 (3d8 + 9)',
      'Speed 20 ft.',
      'Senses darkvision 60 ft., passive Perception 8',
      'Languages understands Common and one other language but can\'t speak',
      'Challenge 1/4 (50 XP)',
      'Actions',
      'Slam. Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.'
    ].join('\n')
  }, { archetype: 'brute' });

  assert.equal(profile.attacks.some((attack) => attack.name === 'Senses'), false);
  assert.equal(profile.attacks.some((attack) => attack.name === 'Slam' && attack.attackKind === 'melee'), true);
  assert.equal(profile.attackProvenance.source, 'parsed_statblock');
});

test('content normalization never emits metadata headings such as Senses as attacks', () => {
  const profile = normalizeMonsterProfile({
    id: 'shadow',
    name: 'Shadow',
    statblock: 'Senses darkvision 60 ft., passive Perception 10'
  }, { archetype: 'skirmisher' });

  assert.equal(profile.attacks.some((attack) => attack.name === 'Senses'), false);
  assert.equal(profile.attacks[0].name, 'Strike');
  assert.equal(profile.attackProvenance.source, 'fallback_strike');
});

test('content normalization preserves real ranged attacks from mixed statblocks', () => {
  const profile = normalizeMonsterProfile({
    id: 'goblin-archer',
    name: 'Goblin Archer',
    statblock: [
      'Senses darkvision 60 ft., passive Perception 10',
      'Actions',
      'Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.'
    ].join('\n')
  }, { archetype: 'archer' });

  assert.equal(profile.attacks.some((attack) => attack.name === 'Shortbow' && attack.attackKind === 'ranged' && attack.rangeFt === 80), true);
});

test('spellcasting text without explicit attack lines does not create fake attacks', () => {
  const profile = normalizeMonsterProfile({
    id: 'mystic',
    name: 'Mystic',
    statblock: [
      'Spellcasting. The mystic is a 9th-level spellcaster.',
      'The mystic has the following spells prepared: mage armor, magic missile, shield.'
    ].join('\n')
  }, { archetype: 'controller' });

  assert.equal(profile.attacks.some((attack) => attack.name === 'Spellcasting'), false);
  assert.equal(profile.attacks[0].name, 'Strike');
  assert.equal(profile.attackProvenance.source, 'fallback_strike');
});

test('zombie candidates use Slam and never metadata headings such as Senses', () => {
  const zombieProfile = normalizeMonsterProfile({
    id: 'zombie-a',
    name: 'Zombie A',
    statblock: [
      'Armor Class 8',
      'Hit Points 22 (3d8 + 9)',
      'Speed 20 ft.',
      'Senses darkvision 60 ft., passive Perception 8',
      'Languages understands Common but can\'t speak',
      'Challenge 1/4 (50 XP)',
      'Actions',
      'Slam. Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.'
    ].join('\n')
  }, { archetype: 'brute' });
  const encounter = normalizeEncounterState({
    id: 'zombie-slam-only',
    round: 1,
    activeActorId: 'zombie-a',
    battlefield: { gridSize: 64, width: 8, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'zombie-a',
        name: 'Zombie A',
        side: 'monsters',
        cell: { x: 2, y: 2 },
        speed: 20,
        attacks: zombieProfile.attacks,
        tactical: zombieProfile.tactical,
        behavior: zombieProfile.behavior
      },
      {
        id: 'aria',
        name: 'Aria',
        side: 'heroes',
        cell: { x: 3, y: 2 },
        speed: 30,
        attacks: []
      }
    ]
  });

  const candidates = generateCandidateActions(encounter, encounter.actors[0], { limit: 24 });
  assert.equal(candidates.some((candidate) => /Senses/.test(candidate.id) || /Senses/.test(candidate.label)), false);
  assert.equal(candidates.some((candidate) => /Slam/.test(candidate.id) || /Slam/.test(candidate.label)), true);
});

test('portable SRD tactical overrides seed representative monster behavior profiles', () => {
  const zombie = normalizeMonsterProfile({ name: 'Zombie', statblock: '- Slam: Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 bludgeoning damage.' }, { archetype: 'brute' });
  const wolf = normalizeMonsterProfile({ name: 'Wolf', statblock: '- Bite: Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 piercing damage.' }, { archetype: 'skirmisher' });
  const goblin = normalizeMonsterProfile({ name: 'Goblin', statblock: '- Scimitar: Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 slashing damage.' }, { archetype: 'skirmisher' });
  const mage = normalizeMonsterProfile({ name: 'Mage', statblock: '- Dagger: Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 piercing damage.' }, { archetype: 'controller' });

  assert.equal(zombie.tactical?.role, 'blocker');
  assert.equal(zombie.tactical?.function, 'body_pressure');
  assert.equal(zombie.tactical?.tags.includes('body_pressure'), true);
  assert.equal(zombie.tactical?.tags.includes('swarm_member'), true);
  assert.deepEqual(zombie.behavior, {
    cognition: 'mindless',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  });
  assert.equal(wolf.tactical?.role, 'skirmisher');
  assert.equal(wolf.tactical?.function, 'melee_harrier');
  assert.equal(wolf.behavior?.coordination, 'pack');
  assert.equal(goblin.behavior?.coordination, 'squad');
  assert.equal(goblin.behavior?.cognition, 'trained');
  assert.equal(mage.tactical?.role, 'caster');
  assert.equal(mage.tactical?.function, 'control');
  assert.equal(mage.behavior?.cognition, 'cunning');
  assert.equal(mage.behavior?.coordination, 'commander_led');
});

test('portable SRD tactical overrides cover the initial representative batch', () => {
  const names = ['Zombie', 'Skeleton', 'Wolf', 'Dire Wolf', 'Goblin', 'Hobgoblin', 'Bandit', 'Guard', 'Acolyte', 'Mage'];
  for (const name of names) {
    const override = srdMonsterTacticalOverride({ name });
    assert.ok(override, `${name} should have an SRD tactical override`);
    assert.ok(override.behavior, `${name} should have behavior metadata`);
  }
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
      tactical: { role: 'striker', function: 'lurker' },
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
  assert.equal(actor.tactical.function, 'lurker');
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
      tactical: { role: 'blocker' },
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
  assert.equal(actor.tactical.role, 'blocker');
  assert.equal(actor.tactical.function, '');
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
  assert.equal(mage.tactical.role, 'caster');
  assert.equal(mage.tactical.role, 'caster');
  assert.equal(mage.tactical.function, 'ritualist');
  assert.equal(mage.tactical.protectedAsset, true);
  assert.equal(mage.tactical.objectiveRole, 'ritual_actor');
  assert.equal(thug.tactical.role, 'blocker');
  assert.equal(thug.tactical.function, 'bodyguard');
  assert.equal(wraith.tactical.role, 'lurker');
  assert.equal(wraith.tactical.function, 'stalker');
  assert.equal(gargoyle.tactical.role, 'lurker');
  assert.equal(gargoyle.tactical.function, 'ambusher');
  assert.equal(fixture.encounter.activeActorId, mage.id);
  assert.equal(fixture.encounter.activationGroups[0]?.id, 'ossuary_gate_defenders');
  assert.equal(fixture.encounter.activationGroups[0]?.actorIds.length, 10);
  assert.equal(description.includes('dyson logos'), true);
  assert.equal(description.includes('https://dysonlogos.blog/maps/commercial-maps/'), true);
  assert.equal(description.includes('https://dysonlogos.blog/wp-content/uploads/2020/11/sanctuary-of-the-magi.png'), true);
  assert.equal(description.includes('ideal_behavior'), true);
  assert.equal(description.includes('protectedasset'), true);
  assert.equal(description.includes('unsupported doctrines'), true);

  const mageOutput = await new SupervisorScriptedController().chooseAction({
    encounter: fixture.encounter,
    actorId: mage.id,
    candidateLimit: 36
  });
  assert.equal(mageOutput.logs[0].data.diagnostics.candidateSetHealth.role, 'caster');

  const thugOutput = await new SupervisorScriptedController().chooseAction({
    encounter: fixture.encounter,
    actorId: thug.id,
    candidateLimit: 36
  });
  assert.equal(thugOutput.logs[0].data.diagnostics.candidateSetHealth.role, 'blocker');

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
    return log.phase === 'decision' && actor?.tactical?.role === 'blocker';
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
  assert.equal(rawDragon?.tactical?.role, 'solo');
  assert.equal(rawDragon?.tactical?.function, 'boss_controller');
  assert.equal(rawCrocodile?.tactical?.role, 'lurker');
  assert.equal(rawCrocodile?.tactical?.function, 'grappler');
  assert.equal(rawLizardfolk?.tactical?.role, 'skirmisher');
  assert.equal(rawLizardfolk?.tactical?.function, 'ranged_harrier');
  assert.equal(rawTroll?.tactical?.role, 'blocker');
  assert.equal(rawTroll?.tactical?.function, 'zone_anchor');
  assert.ok(dragon);
  assert.equal(dragon.sizeCells, 2);
  assert.equal(dragon.tactical.role, 'solo');
  assert.equal(dragon.tactical.function, 'boss_controller');
  assert.equal(dragon.tactical.secondaryRoles.includes('caster'), true);
  assert.equal(dragon.tactical.secondaryRoles.includes('striker'), true);
  assert.deepEqual(dragon.behavior, inferDefaultBehaviorProfile(dragon));
  assert.equal(troll.tactical.role, 'blocker');
  assert.equal(troll.tactical.function, 'zone_anchor');
  assert.deepEqual(troll.behavior, inferDefaultBehaviorProfile(troll));
  assert.equal(lizardfolk.tactical.role, 'skirmisher');
  assert.equal(lizardfolk.tactical.function, 'ranged_harrier');
  assert.deepEqual(lizardfolk.behavior, inferDefaultBehaviorProfile(lizardfolk));
  assert.equal(crocodile.sizeCells, 3);
  assert.equal(crocodile.tactical.role, 'lurker');
  assert.equal(crocodile.tactical.function, 'grappler');
  assert.deepEqual(crocodile.behavior, inferDefaultBehaviorProfile(crocodile));
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
  assert.match(fixture.description, /low-cognition benchmark fixture/i);
});

test('Zombie Doorway Press preserves explicit mindless zombie behavior while other actors keep defaults', () => {
  const fixture = zombieDoorwayFixture();
  const zombie = fixture.encounter.actors.find((actor) => actor.id === 'zombie_a');
  const hero = fixture.encounter.actors.find((actor) => actor.id === 'hero_a');
  const rawZombie = (fixture.raw.actors || []).find((actor) => actor.id === 'zombie_a');

  assert.ok(zombie);
  assert.equal(rawZombie?.behavior?.cognition, 'mindless');
  assert.equal(zombie.tactical.role, 'blocker');
  assert.equal(zombie.tactical.function, 'body_pressure');
  assert.equal(zombie.tactical.tags.includes('body_pressure'), true);
  assert.equal(zombie.tactical.tags.includes('swarm_member'), true);
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
  assert.match(fixture.description, /animal\/pack benchmark fixture/i);
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
  assert.equal(wolf.tactical.role, 'skirmisher');
  assert.equal(wolf.tactical.function, 'melee_harrier');
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

test('Sinkhole Watch preserves explicit trained/squad monster behavior while heroes keep defaults', () => {
  const fixture = sinkholeWatchFixture();
  const goblin = fixture.encounter.actors.find((actor) => actor.id === 'cbnpkbyw');
  const bugbear = fixture.encounter.actors.find((actor) => actor.id === 'z1xkam45');
  const hero = fixture.encounter.actors.find((actor) => actor.id === 'cp05pyfz');
  const rawGoblin = (fixture.raw.actors || []).find((actor) => actor.id === 'cbnpkbyw');

  assert.equal(fixture.raw.benchmark_status, 'regression');
  assert.ok(goblin);
  assert.deepEqual(rawGoblin?.behavior, {
    cognition: 'trained',
    drive: 'tactical_role_objective',
    riskTolerance: 'normal',
    coordination: 'squad',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  });
  assert.deepEqual(goblin.behavior, inferDefaultBehaviorProfile(goblin));
  assert.ok(bugbear);
  assert.deepEqual(bugbear.behavior, inferDefaultBehaviorProfile(bugbear));
  assert.ok(hero);
  assert.deepEqual(hero.behavior, inferDefaultBehaviorProfile(hero));
});

test('animal pack prefers isolated or wounded reachable prey over protected prey', async () => {
  const encounter = normalizeEncounterState({
    id: 'animal-pack-isolated-prey',
    activeActorId: 'wolf',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'wolf',
        name: 'Wolf',
        side: 'monsters',
        cell: { x: 2, y: 3 },
        speed: 40,
        tactical: { role: 'skirmisher', function: 'skirmisher' },
        behavior: {
          cognition: 'animal',
          drive: 'isolate_weak_prey',
          riskTolerance: 'self_preserving',
          coordination: 'pack',
          planningHorizon: 'short',
          targetStickiness: 'medium'
        },
        attacks: [{ name: 'Bite', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 }]
      },
      { id: 'hero_protected', name: 'Hero Protected', side: 'heroes', cell: { x: 6, y: 3 }, speed: 30, hp: '24/24', attacks: [] },
      { id: 'hero_screen', name: 'Hero Screen', side: 'heroes', cell: { x: 7, y: 3 }, speed: 30, hp: '24/24', attacks: [] },
      { id: 'hero_weak', name: 'Hero Weak', side: 'heroes', cell: { x: 7, y: 1 }, speed: 30, hp: '8/24', attacks: [] }
    ]
  });

  const output = await new SupervisorScriptedController().chooseAction({
    encounter,
    actorId: 'wolf',
    candidateLimit: 36
  });
  const selected = output.logs[0]?.data?.selected;

  assert.equal(selected?.family, 'move_and_attack');
  assert.deepEqual(selected?.targetIds, ['hero_weak']);
  assert.equal(selected?.scoreBreakdown?.behaviorWoundedPreyBonus >= 2, true);
});

test('animal pack does not receive squad doctrine focus bonuses', async () => {
  const fixture = wolfPackFixture();
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });
  const decisions = (output.logs || [])
    .filter((log) => log.phase === 'decision')
    .filter((log) => ['wolf_a', 'wolf_b', 'wolf_c', 'wolf_d'].includes(log.actorId))
    .filter((log) => log.data?.selected)
    .map((log) => ({
      actorId: log.actorId,
      selected: log.data.selected,
      supervisorBreakdown: log.data.selected?.supervisorBreakdown || {},
      scoreBreakdown: log.data.selected?.scoreBreakdown || {}
    }));

  assert.equal(decisions.length, 4);
  for (const decision of decisions) {
    assert.equal(decision.supervisorBreakdown.targetPriorityGroupFocusBonus ?? 0, 0);
    assert.equal(decision.supervisorBreakdown.targetPriorityMainThreatBonus ?? 0, 0);
    assert.equal(Object.keys(decision.supervisorBreakdown).some((key) => key.startsWith('doctrine')), false);
  }
  assert.equal(
    decisions.some((decision) => (decision.scoreBreakdown.behaviorWoundedPreyBonus ?? 0) > 0 || (decision.scoreBreakdown.behaviorIsolatedPreyBonus ?? 0) > 0),
    true
  );
});

test('Wolf Pack Harrier wolves do not emit ranged-skirmisher warnings for melee harassment', async () => {
  const fixture = wolfPackFixture();
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });
  const decisions = (output.logs || [])
    .filter((log) => log.phase === 'decision')
    .filter((log) => ['wolf_a', 'wolf_b', 'wolf_c', 'wolf_d'].includes(log.actorId))
    .filter((log) => log.data?.selected)
    .map((log) => ({
      actorId: log.actorId,
      selected: log.data.selected,
      diagnostics: log.data.diagnostics || {}
    }));

  assert.equal(decisions.length, 4);
  for (const decision of decisions) {
    assert.equal(decision.diagnostics.roleCompliance?.role, 'skirmisher');
    assert.equal(decision.selected.family, 'move_and_attack');
    assert.equal(decision.diagnostics.roleCompliance?.status, 'pass');
    assert.doesNotMatch(decision.diagnostics.roleCompliance?.concern || '', /ranged mobility/i);
    assert.equal(decision.diagnostics.candidateSetHealth?.status, 'pass');
    assert.equal(decision.diagnostics.candidateSetHealth?.expectedFamilies.includes('shoot_and_scoot'), false);
    assert.equal(decision.diagnostics.candidateSetHealth?.missingExpectedCandidates.includes('shoot_and_scoot'), false);
  }
});

test('movement reaction risk penalizes self-preserving animals more than mindless zombies', () => {
  const buildEncounter = (id, actorName, behavior) => normalizeEncounterState({
    id,
    activeActorId: 'actor',
    battlefield: { width: 12, height: 8, edges: [], tiles: [], interactables: [] },
    actors: [
      {
        id: 'actor',
        name: actorName,
        side: 'monsters',
        cell: { x: 3, y: 3 },
        speed: 30,
        tactical: { role: 'skirmisher', function: 'skirmisher' },
        behavior,
        attacks: [{ name: 'Bite', attackKind: 'melee', rangeFt: 5, expectedDamage: 7 }]
      },
      {
        id: 'guard',
        name: 'Guard',
        side: 'heroes',
        cell: { x: 4, y: 3 },
        speed: 30,
        attacks: [{ name: 'Spear', attackKind: 'melee', rangeFt: 5, expectedDamage: 6 }]
      },
      {
        id: 'prey',
        name: 'Prey',
        side: 'heroes',
        cell: { x: 8, y: 4 },
        speed: 30,
        hp: '10/24',
        attacks: []
      }
    ]
  });

  const animalEncounter = buildEncounter('animal-risk', 'Wolf', {
    cognition: 'animal',
    drive: 'isolate_weak_prey',
    riskTolerance: 'self_preserving',
    coordination: 'pack',
    planningHorizon: 'short',
    targetStickiness: 'medium'
  });
  const zombieEncounter = buildEncounter('zombie-risk', 'Zombie', {
    cognition: 'mindless',
    drive: 'nearest_living_prey',
    riskTolerance: 'fearless',
    coordination: 'none',
    planningHorizon: 'immediate',
    targetStickiness: 'high'
  });

  const candidate = {
    id: 'move_and_attack:actor:prey:Bite:6,4',
    family: 'move_and_attack',
    actorId: 'actor',
    move: {
      actorId: 'actor',
      to: { x: 6, y: 4 },
      path: [{ x: 3, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 4 }]
    },
    action: {
      type: 'attack',
      actorId: 'actor',
      targetId: 'prey',
      details: 'Bite',
      attackKind: 'melee',
      rangeFt: 5
    },
    targetIds: ['prey'],
    fromCell: { x: 6, y: 4 },
    expectedDamage: 7,
    moveSteps: 4,
    legal: true
  };

  const animalScore = scoreCandidate(animalEncounter, candidate, { stance: 'opportunistic' });
  const zombieScore = scoreCandidate(zombieEncounter, candidate, { stance: 'opportunistic' });

  assert.equal((animalScore.scoreBreakdown.movementReactionRisk ?? 0) < 0, true);
  assert.equal((animalScore.scoreBreakdown.behaviorMovementReactionRiskAdjustment ?? 0) < 0, true);
  assert.equal((zombieScore.scoreBreakdown.movementReactionRisk ?? 0) < 0, true);
  assert.equal((zombieScore.scoreBreakdown.behaviorMovementReactionRiskAdjustment ?? 0) > 0, true);
  assert.equal(
    Math.abs(animalScore.scoreBreakdown.movementReactionRisk + animalScore.scoreBreakdown.behaviorMovementReactionRiskAdjustment)
      > Math.abs(zombieScore.scoreBreakdown.movementReactionRisk + zombieScore.scoreBreakdown.behaviorMovementReactionRiskAdjustment),
    true
  );
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
        tactical: { role: 'blocker', function: 'blocker' },
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
        tactical: { role: 'blocker', function: 'blocker' },
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
  assert.equal(dragon.diagnostics.candidateSetHealth?.role, 'solo');
  assert.equal(dragon.diagnostics.candidateSetHealth?.function, 'boss_controller');
  assert.equal(dragon.diagnostics.roleCompliance?.role, 'solo');
  assert.equal(dragon.diagnostics.roleCompliance?.function, 'boss_controller');
  assert.equal(dragon.selected.family, 'shoot_and_scoot');
  assert.equal(dragon.selected.actionName, 'Acid Breath');

  assert.ok(lizardfolkDecisions.length >= 4, 'expected decisions for all lizardfolk');
  assert.ok(
    lizardfolkDecisions.some((entry) => entry.selected.family === 'shoot_and_scoot'),
    'expected at least one lizardfolk to use shoot_and_scoot harassment'
  );
  for (const decision of lizardfolkDecisions) {
    assert.equal(decision.diagnostics.candidateSetHealth?.role, 'skirmisher');
    assert.equal(decision.diagnostics.candidateSetHealth?.function, 'ranged_harrier');
    assert.equal(decision.diagnostics.roleCompliance?.role, 'skirmisher');
    assert.equal(decision.diagnostics.roleCompliance?.function, 'ranged_harrier');
    assert.equal(decision.diagnostics.candidateSetHealth?.expectedFamilies.includes('shoot_and_scoot'), true);
    assert.equal(harassmentFamilies.has(decision.selected.family), true, `${decision.actor.name} should use harassment-compatible family`);
    assert.equal(decision.selected.actionName, 'Javelin');
  }

  assert.equal(trollDecisions.length, 2);
  for (const decision of trollDecisions) {
    assert.equal(decision.diagnostics.candidateSetHealth?.role, 'blocker');
    assert.equal(decision.diagnostics.candidateSetHealth?.function, 'zone_anchor');
    assert.equal(decision.diagnostics.roleCompliance?.role, 'blocker');
    assert.equal(decision.diagnostics.roleCompliance?.function, 'zone_anchor');
    assert.equal(['move_and_attack', 'attack_from_current', 'hold_position', 'advance_to_attack'].includes(decision.selected.family), true);
    if (decision.selected.family === 'move_and_attack' || decision.selected.family === 'attack_from_current') {
      assert.equal(['Claw', 'Bite'].includes(decision.selected.actionName), true);
    }
  }

  const crocodile = byActorId.get('giant_crocodile');
  assert.ok(crocodile, 'expected group decision for Giant Crocodile');
  assert.equal(crocodile.diagnostics.candidateSetHealth?.role, 'lurker');
  assert.equal(crocodile.diagnostics.candidateSetHealth?.function, 'grappler');
  assert.equal(crocodile.diagnostics.roleCompliance?.role, 'lurker');
  assert.equal(crocodile.diagnostics.roleCompliance?.function, 'grappler');
  assert.equal(crocodile.selected.family, 'hold_hidden');
  assert.equal(crocodile.selected.actionName, 'hold_hidden');
  assert.equal(crocodile.diagnostics.candidateSetHealth?.status, 'weak_pass');
  assert.equal(crocodile.diagnostics.roleCompliance?.status, 'pass');
  assert.equal(crocodile.diagnostics.roleCompliance?.classification, 'unsupported_ambush_trigger');
  assert.deepEqual(
    crocodile.diagnostics.candidateSetHealth?.missingExpectedCandidates,
    ['move_and_attack', 'attack_from_current']
  );
  assert.deepEqual(
    crocodile.diagnostics.candidateSetHealth?.unsupportedExpectedCandidates,
    []
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

test('group controller preserves direct tactical function on live-token-shaped actors', async () => {
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
        tactical: { role: 'solo', function: 'boss_controller', secondaryRoles: ['caster', 'striker'] },
        attacks: [{ name: 'Acid Breath', attackKind: 'ranged', rangeFt: 60, expectedDamage: 20 }]
      },
      {
        id: 'crocodile',
        name: 'Giant Crocodile',
        side: 'monsters',
        cell: { x: 1, y: 3 },
        speed: 30,
        tactical: { role: 'lurker', function: 'grappler', secondaryRoles: ['striker'] },
        attacks: [{ name: 'Bite', attackKind: 'melee', rangeFt: 5, expectedDamage: 12 }]
      },
      {
        id: 'lizardfolk',
        name: 'Lizardfolk A',
        side: 'monsters',
        cell: { x: 1, y: 5 },
        speed: 30,
        tactical: { role: 'skirmisher', function: 'ranged_harrier', secondaryRoles: ['artillery'] },
        attacks: [{ name: 'Javelin', attackKind: 'ranged', rangeFt: 30, expectedDamage: 5 }]
      },
      {
        id: 'troll',
        name: 'Troll A',
        side: 'monsters',
        cell: { x: 1, y: 6 },
        speed: 30,
        tactical: { role: 'blocker', function: 'zone_anchor', secondaryRoles: ['striker'] },
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

  assert.equal(decisionLogs.get('dragon')?.data?.diagnostics?.candidateSetHealth?.role, 'solo');
  assert.equal(decisionLogs.get('dragon')?.data?.diagnostics?.candidateSetHealth?.function, 'boss_controller');
  assert.equal(decisionLogs.get('crocodile')?.data?.diagnostics?.candidateSetHealth?.role, 'lurker');
  assert.equal(decisionLogs.get('crocodile')?.data?.diagnostics?.candidateSetHealth?.function, 'grappler');
  assert.equal(decisionLogs.get('lizardfolk')?.data?.diagnostics?.candidateSetHealth?.role, 'skirmisher');
  assert.equal(decisionLogs.get('lizardfolk')?.data?.diagnostics?.candidateSetHealth?.function, 'ranged_harrier');
  assert.equal(decisionLogs.get('troll')?.data?.diagnostics?.candidateSetHealth?.role, 'blocker');
  assert.equal(decisionLogs.get('troll')?.data?.diagnostics?.candidateSetHealth?.function, 'zone_anchor');
});

test('Sinkhole Watch audit shows descriptive doctrine and blocker mapping ambiguity rather than a hard legality failure', async () => {
  const fixture = sinkholeWatchFixture();
  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 36
  });
  const doctrineLog = output.logs.find((log) => log.phase === 'doctrine_influence');
  const hobgoblinDecisions = output.logs
    .filter((log) => log.phase === 'decision')
    .filter((log) => ['2emieq7f', 'bggpdl26'].includes(log.actorId))
    .map((log) => log.data);

  assert.ok(doctrineLog);
  assert.equal(doctrineLog.data.doctrineInfluence.scoringMode, 'descriptive');
  assert.match(doctrineLog.data.doctrineInfluence.note, /only protect_caster has explicit doctrine score modifiers/i);
  assert.equal(hobgoblinDecisions.length, 2);
  assert.equal(hobgoblinDecisions.every((decision) => decision.selected?.family === 'shoot_and_scoot'), true);
  assert.equal(hobgoblinDecisions.every((decision) => decision.diagnostics?.roleCompliance?.classification === 'mapping_or_fixture_ambiguous'), true);
});

test('visible fixture actors without tactical metadata keep inferred roles', async () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../packages/tactical-ai-content/encounters/files/bandit-doorway-ambush-2026-04-26.yaml'),
    'utf8'
  );
  const fixture = parseVisibleEncounterFixture(source);
  const actor = fixture.encounter.actors.find((entry) => entry.id === fixture.encounter.activeActorId);

  assert.equal(actor.tactical.role, '');
  assert.equal(actor.tactical.function, '');

  const output = await new SupervisorScriptedController().chooseAction({
    encounter: fixture.encounter,
    actorId: actor.id,
    candidateLimit: 36
  });
  assert.equal(output.logs[0].data.diagnostics.candidateSetHealth.role, 'artillery');
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
