import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_PACKET_SCENARIOS } from './ai-turn-packet-scenarios.fixture.mjs';
import { evaluateAiTurnResponse, validateAiTurnSchemaShape } from '../ai-turn-eval-utils.mjs';

const duelScenario = AI_PACKET_SCENARIOS.find((scenario) => scenario.id === 'duel-goblin-vs-acolyte');

test('schema validator accepts the expected VTT response shape', () => {
  const result = validateAiTurnSchemaShape({
    summary: 'Goblin closes and stabs.',
    moves: [{ token: 'Goblin', rationale: 'Close distance.', path: [[4, 4], [4, 4]], to: [4, 4] }],
    actions: [{ token: 'Goblin', type: 'attack', target: 'Acolyte', details: 'Scimitar', rationale: 'Adjacent target.', attack_kind: 'melee', range_ft: 5 }],
    end_turn: true
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('evaluator marks a legal adjacent melee attack as a legal turn', () => {
  const result = evaluateAiTurnResponse(duelScenario.state, {
    summary: 'The goblin lunges into the acolyte with its scimitar.',
    moves: [],
    actions: [{ token: 'Goblin', type: 'attack', target: 'Acolyte', details: 'Scimitar', rationale: 'Already adjacent.', attack_kind: 'melee', range_ft: 5 }],
    end_turn: true
  });

  assert.equal(result.schemaValid, true);
  assert.equal(result.movesLegal, true);
  assert.equal(result.actionsLegal, true);
  assert.equal(result.legalTurn, true);
  assert.equal(result.tacticalSound, true);
});

test('evaluator rejects an illegal move that exceeds speed', () => {
  const result = evaluateAiTurnResponse(duelScenario.state, {
    summary: 'The goblin sprints too far.',
    moves: [{ token: 'Goblin', rationale: 'Rush forward.', path: null, to: [20, 20] }],
    actions: [],
    end_turn: true
  });

  assert.equal(result.legalTurn, false);
  assert.equal(result.movesLegal, false);
  assert.match(result.issues.join('\n'), /speed 30 ft allows 6 cells/i);
});

test('evaluator rejects a melee attack made from out of range after movement', () => {
  const result = evaluateAiTurnResponse(duelScenario.state, {
    summary: 'The goblin backs off and somehow still swings.',
    moves: [{ token: 'Goblin', rationale: 'Retreat first.', path: null, to: [0, 0] }],
    actions: [{ token: 'Goblin', type: 'attack', target: 'Acolyte', details: 'Scimitar', rationale: 'Still attacks.', attack_kind: 'melee', range_ft: 5 }],
    end_turn: true
  });

  assert.equal(result.movesLegal, true);
  assert.equal(result.actionsLegal, false);
  assert.equal(result.legalTurn, false);
  assert.match(result.issues.join('\n'), /cannot make a melee attack/i);
});

test('compact candidate consistency catches destinations outside listed move candidates', () => {
  const result = evaluateAiTurnResponse(duelScenario.state, {
    summary: 'The goblin moves far away.',
    moves: [{ token: 'Goblin', rationale: 'Move somewhere not offered.', path: null, to: [0, 0] }],
    actions: [],
    end_turn: true
  }, { compactOptions: { moveCandidateLimit: 5, attackOpportunityLimit: 6 } });

  assert.equal(result.movesLegal, true);
  assert.equal(result.moveCandidateMatch, false);
  assert.match(result.issues.join('\n'), /not listed in compact legal move candidates/i);
});

test('evaluator flags dodge in melee when a legal melee attack is still available', () => {
  const result = evaluateAiTurnResponse(duelScenario.state, {
    summary: 'The goblin turtles up instead of attacking.',
    moves: [],
    actions: [{ token: 'Goblin', type: 'dodge', target: null, details: 'Dodges.', rationale: 'Play defensively.', attack_kind: null, range_ft: null }],
    end_turn: true
  });

  assert.equal(result.legalTurn, true);
  assert.equal(result.tacticalSound, false);
  assert.equal(result.dodgeInMeleeWithoutAttack, true);
  assert.ok(result.meleeAttackOptionsAtEnd > 0);
  assert.match(result.issues.join('\n'), /took Dodge even though/i);
});
