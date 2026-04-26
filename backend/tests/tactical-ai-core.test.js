import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HumanController,
  ScriptedController,
  SimpleGridRulesAdapter,
  UtilityController,
  createControllerRegistry,
  generateCandidateActions,
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
