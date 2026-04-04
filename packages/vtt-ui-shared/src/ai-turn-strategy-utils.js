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
    id: 'single_fast',
    label: 'Single (Fast)',
    description: 'Lowest-latency speed mode for one monster taking a quick turn.',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
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
