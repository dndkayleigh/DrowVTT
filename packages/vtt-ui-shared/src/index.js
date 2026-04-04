export const VTT_UI_SHARED_STATUS = {
  phase: 'initial-tactical-modules',
  sourceOfTruth: 'oss',
  intendedConsumers: ['oss', 'saas']
};

export function getVttUiSharedStatus() {
  return { ...VTT_UI_SHARED_STATUS };
}

export * from './ai-selection-utils.js';
export * from './ai-turn-strategy-utils.js';
export * from './ai-turn-packet-utils.js';
