export const ALLOWED_AI_MODELS = [
  'gpt-4.1-mini',
  'gpt-4.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5.4-mini'
];

export const DEFAULT_AI_TURN_STRATEGY_ID = 'balanced';

export const AI_TURN_STRATEGIES = [
  {
    id: 'full',
    label: 'Full',
    description: 'Highest-context baseline for the strongest tactical read.',
    model: 'gpt-5',
    packetVariant: 'full'
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Best compact tactical mode from the benchmark sweep.',
    model: 'gpt-5',
    packetVariant: 'compact_moves5'
  },
  {
    id: 'fast',
    label: 'Fast',
    description: 'Lowest-latency speed mode from the benchmark sweep.',
    model: 'gpt-5.4-mini',
    packetVariant: 'compact_moves5'
  }
];

export function sanitizeAiModel(model, fallback = 'gpt-5') {
  return ALLOWED_AI_MODELS.includes(model) ? model : fallback;
}

export function getAiTurnStrategy(strategyId) {
  return AI_TURN_STRATEGIES.find((strategy) => strategy.id === strategyId) || null;
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
