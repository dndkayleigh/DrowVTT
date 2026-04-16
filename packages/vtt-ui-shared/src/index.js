export const VTT_UI_SHARED_STATUS = {
  phase: 'shell-markup-tactical-and-runtime-modules',
  sourceOfTruth: 'oss',
  intendedConsumers: ['oss', 'saas']
};

export function getVttUiSharedStatus() {
  return { ...VTT_UI_SHARED_STATUS };
}

export * from './ai-selection-utils.js';
export * from './ai-turn-strategy-utils.js';
export * from './ai-turn-packet-utils.js';
export * from './render-oss-vtt-shell.js';
export * from './srd-monster-utils.js';
export * from './srd-monsters-data.js';
export * from './token-spawn-utils.js';
export * from './vtt-runtime-utils.js';
