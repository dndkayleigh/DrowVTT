export const ALLOWED_AI_MODELS = [
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5.4-mini'
];

export const DEFAULT_AI_TURN_STRATEGY_ID = 'single_tactical';

export const AI_TURN_STRATEGIES = [
  {
    id: 'single_tactical',
    label: 'Single (Tactical)',
    description: 'Highest-context tactical read for one monster taking a smarter turn.',
    model: 'gpt-5',
    packetVariant: 'full'
  },
  {
    id: 'group_tactical',
    label: 'Group (Tactical)',
    description: 'Uses the strongest model and the full tactical packet for coordinated enemy turns.',
    model: 'gpt-5',
    packetVariant: 'full'
  },
  {
    id: 'llm_supervisor_single',
    label: 'LLM Supervisor + Tactical (Single)',
    description: 'Uses the same LLM tactical path, but explicitly supervises and ranks candidate actions for one monster.',
    model: 'gpt-5',
    packetVariant: 'full_moves5_attacks6',
    supervisor: 'llm'
  },
  {
    id: 'llm_supervisor_group',
    label: 'LLM Supervisor + Tactical (Group)',
    description: 'Uses the same LLM tactical path, but explicitly supervises coordinated grouped candidate actions.',
    model: 'gpt-5',
    packetVariant: 'full_moves5_attacks6',
    supervisor: 'llm',
    requiresGroup: true
  },
  {
    id: 'single_fast',
    label: 'Single (Fast)',
    description: 'Lowest-latency speed mode for one monster taking a quick turn.',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
  },
  {
    id: 'controller_human',
    label: 'Human Controller',
    description: 'Uses the portable controller contract for manually selected or replayed human actions.',
    model: 'none',
    packetVariant: 'controller',
    controllerId: 'human'
  },
  {
    id: 'controller_scripted',
    label: 'Scripted',
    description: 'Runs a deterministic behavior-rule baseline locally with no LLM dependency.',
    model: 'none',
    packetVariant: 'controller',
    controllerId: 'scripted_baseline',
    controllerIds: {
      single: 'scripted_baseline',
      group: 'scripted_baseline_group'
    },
    supportsActivationScope: true
  },
  {
    id: 'controller_utility',
    label: 'Utility',
    description: 'Runs deterministic candidate scoring locally with line-of-sight and blocking-edge legality.',
    model: 'none',
    packetVariant: 'controller',
    controllerId: 'utility_baseline',
    controllerIds: {
      single: 'utility_baseline',
      group: 'utility_baseline_group'
    },
    supportsActivationScope: true
  },
  {
    id: 'controller_supervisor_scripted',
    label: 'Supervisor',
    description: 'Runs scripted candidate generation, then a deterministic supervisor ranks candidate actions.',
    model: 'none',
    packetVariant: 'controller',
    controllerId: 'supervisor_scripted_single',
    controllerIds: {
      single: 'supervisor_scripted_single',
      group: 'supervisor_scripted_group'
    },
    supportsActivationScope: true
  }
];

const AI_TURN_STRATEGY_ALIASES = new Map([
  ['fast', 'single_fast'],
  ['full', 'single_tactical'],
  ['balanced', 'single_tactical'],
  ['single', 'single_fast'],
  ['single_fast', 'single_fast'],
  ['single-fast', 'single_fast'],
  ['single_tactical', 'single_tactical'],
  ['single-tactical', 'single_tactical'],
  ['tactical', 'single_tactical'],
  ['llm_supervisor', 'llm_supervisor_single'],
  ['llm-supervisor', 'llm_supervisor_single'],
  ['llm_supervisor_single', 'llm_supervisor_single'],
  ['llm-supervisor-single', 'llm_supervisor_single'],
  ['llm_supervisor_group', 'llm_supervisor_group'],
  ['llm-supervisor-group', 'llm_supervisor_group'],
  ['human', 'controller_human'],
  ['controller_human', 'controller_human'],
  ['controller-human', 'controller_human'],
  ['scripted', 'controller_scripted'],
  ['controller_scripted', 'controller_scripted'],
  ['controller-scripted', 'controller_scripted'],
  ['utility', 'controller_utility'],
  ['controller_utility', 'controller_utility'],
  ['controller-utility', 'controller_utility'],
  ['supervisor_scripted', 'controller_supervisor_scripted'],
  ['supervisor-scripted', 'controller_supervisor_scripted'],
  ['supervisor_scripted_single', 'controller_supervisor_scripted'],
  ['controller_supervisor_scripted_single', 'controller_supervisor_scripted'],
  ['controller_supervisor_scripted', 'controller_supervisor_scripted'],
  ['supervisor_scripted_group', 'controller_supervisor_scripted'],
  ['controller_supervisor_scripted_group', 'controller_supervisor_scripted'],
  ['group', 'group_tactical'],
  ['group_strategy', 'group_tactical'],
  ['group-strategy', 'group_tactical'],
  ['groupstrategy', 'group_tactical'],
  ['group_tactical', 'group_tactical'],
  ['group-tactical', 'group_tactical'],
  ['strategy', 'group_tactical']
]);

export function sanitizeAiModel(model, fallback = 'gpt-5') {
  return ALLOWED_AI_MODELS.includes(model) ? model : fallback;
}

export function getAiTurnStrategy(strategyId) {
  const normalized = String(strategyId || '').trim().toLowerCase();
  const canonicalId = AI_TURN_STRATEGY_ALIASES.get(normalized) || normalized;
  return AI_TURN_STRATEGIES.find((strategy) => strategy.id === canonicalId) || null;
}

export function resolveAiTurnRequest({ strategy, model, fallbackStrategyId = DEFAULT_AI_TURN_STRATEGY_ID } = {}) {
  const selectedStrategy = getAiTurnStrategy(strategy) || getAiTurnStrategy(fallbackStrategyId);
  if (selectedStrategy) {
    return {
      strategyId: selectedStrategy.id,
      model: selectedStrategy.model,
      packetVariant: selectedStrategy.packetVariant
    };
  }

  return {
    strategyId: null,
    model: sanitizeAiModel(model, 'gpt-5'),
    packetVariant: null
  };
}
