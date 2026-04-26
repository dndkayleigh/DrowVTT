import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AI_TURN_STRATEGY_ID,
  getAiTurnStrategy,
  resolveAiTurnRequest
} from '../../data/ai-turn-strategy-utils.mjs';

test('OSS AI turn strategies use the new single and group tactical mapping', () => {
  assert.equal(DEFAULT_AI_TURN_STRATEGY_ID, 'single_tactical');

  assert.deepEqual(getAiTurnStrategy('single_fast'), {
    id: 'single_fast',
    label: 'Single (Fast)',
    description: 'Lowest-latency speed mode for one monster taking a quick turn.',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
  });

  assert.deepEqual(getAiTurnStrategy('single_tactical'), {
    id: 'single_tactical',
    label: 'Single (Tactical)',
    description: 'Highest-context tactical read for one monster taking a smarter turn.',
    model: 'gpt-5',
    packetVariant: 'full'
  });

  assert.deepEqual(getAiTurnStrategy('group_tactical'), {
    id: 'group_tactical',
    label: 'Group (Tactical)',
    description: 'Uses the strongest model and the full tactical packet for coordinated enemy turns.',
    model: 'gpt-5',
    packetVariant: 'full'
  });

  assert.deepEqual(getAiTurnStrategy('llm_supervisor_single'), {
    id: 'llm_supervisor_single',
    label: 'LLM Supervisor + Tactical (Single)',
    description: 'Uses the same LLM tactical path, but explicitly supervises and ranks candidate actions for one monster.',
    model: 'gpt-5',
    packetVariant: 'full_moves5_attacks6',
    supervisor: 'llm'
  });

  assert.deepEqual(getAiTurnStrategy('llm_supervisor_group'), {
    id: 'llm_supervisor_group',
    label: 'LLM Supervisor + Tactical (Group)',
    description: 'Uses the same LLM tactical path, but explicitly supervises coordinated grouped candidate actions.',
    model: 'gpt-5',
    packetVariant: 'full_moves5_attacks6',
    supervisor: 'llm',
    requiresGroup: true
  });

  assert.deepEqual(getAiTurnStrategy('controller_supervisor_scripted_single'), {
    id: 'controller_supervisor_scripted_single',
    label: 'Supervisor + Scripted (Single)',
    description: 'Runs scripted candidate generation, then a deterministic supervisor ranks candidate actions for one actor.',
    model: 'none',
    packetVariant: 'controller',
    controllerId: 'supervisor_scripted_single'
  });

  assert.deepEqual(getAiTurnStrategy('controller_supervisor_scripted_group'), {
    id: 'controller_supervisor_scripted_group',
    label: 'Supervisor + Scripted (Group)',
    description: 'Runs grouped scripted candidate generation with reservation-aware supervisor selection.',
    model: 'none',
    packetVariant: 'controller',
    controllerId: 'supervisor_scripted_group',
    requiresGroup: true
  });
});

test('OSS AI turn strategy aliases stay backward compatible', () => {
  assert.equal(getAiTurnStrategy('fast')?.id, 'single_fast');
  assert.equal(getAiTurnStrategy('full')?.id, 'single_tactical');
  assert.equal(getAiTurnStrategy('balanced')?.id, 'single_tactical');
  assert.equal(getAiTurnStrategy('strategy')?.id, 'group_tactical');
  assert.equal(getAiTurnStrategy('group_strategy')?.id, 'group_tactical');
  assert.equal(getAiTurnStrategy('llm_supervisor')?.id, 'llm_supervisor_single');
  assert.equal(getAiTurnStrategy('llm-supervisor-group')?.id, 'llm_supervisor_group');
  assert.equal(getAiTurnStrategy('supervisor_scripted')?.id, 'controller_supervisor_scripted_single');
  assert.equal(getAiTurnStrategy('supervisor_scripted_group')?.id, 'controller_supervisor_scripted_group');
});

test('resolveAiTurnRequest returns the expected model and packet for each tactical mode', () => {
  assert.deepEqual(resolveAiTurnRequest({ strategy: 'single_fast' }), {
    strategyId: 'single_fast',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'single_tactical' }), {
    strategyId: 'single_tactical',
    model: 'gpt-5',
    packetVariant: 'full'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'group_tactical' }), {
    strategyId: 'group_tactical',
    model: 'gpt-5',
    packetVariant: 'full'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'llm_supervisor_single' }), {
    strategyId: 'llm_supervisor_single',
    model: 'gpt-5',
    packetVariant: 'full_moves5_attacks6'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'llm_supervisor_group' }), {
    strategyId: 'llm_supervisor_group',
    model: 'gpt-5',
    packetVariant: 'full_moves5_attacks6'
  });

  assert.deepEqual(resolveAiTurnRequest({ strategy: 'controller_supervisor_scripted_single' }), {
    strategyId: 'controller_supervisor_scripted_single',
    model: 'none',
    packetVariant: 'controller'
  });
});
