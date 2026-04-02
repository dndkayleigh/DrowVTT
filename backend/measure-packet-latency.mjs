import 'dotenv/config';
import OpenAI from 'openai';
import { buildAiTurnPacketCompactFromState, buildAiTurnPacketFromState, buildAiTurnPacketVerboseConstrainedFromState } from '../data/ai-turn-packet-utils.mjs';
import { AI_PACKET_SCENARIOS } from './tests/ai-turn-packet-scenarios.fixture.mjs';
import { vttResponseSchema } from './vtt-response-schema.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY is required to run latency measurements.');
  process.exit(1);
}

const model = process.env.OPENAI_MODEL || 'gpt-5';
const scenarioFilter = process.env.SCENARIOS
  ? new Set(process.env.SCENARIOS.split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const runs = Math.max(1, Number(process.env.RUNS || 1));
const allVariants = [
  { id: 'full', build: (state) => buildAiTurnPacketFromState(state) },
  { id: 'full_moves5_attacks6', build: (state) => buildAiTurnPacketVerboseConstrainedFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 }) },
  { id: 'compact_base', build: (state) => buildAiTurnPacketCompactFromState(state) },
  { id: 'compact_moves5', build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5 }) },
  { id: 'compact_attacks6', build: (state) => buildAiTurnPacketCompactFromState(state, { attackOpportunityLimit: 6 }) },
  { id: 'compact_summary', build: (state) => buildAiTurnPacketCompactFromState(state, { statblockMode: 'summary' }) },
  { id: 'compact_moves5_attacks6', build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 }) },
  { id: 'compact_moves5_summary', build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, statblockMode: 'summary' }) },
  { id: 'compact_moves5_attacks6_summary', build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6, statblockMode: 'summary' }) }
];
const variantFilter = process.env.VARIANTS
  ? new Set(process.env.VARIANTS.split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const variants = allVariants.filter((variant) => !variantFilter || variantFilter.has(variant.id));

const selectedScenarios = AI_PACKET_SCENARIOS.filter((scenario) =>
  !scenarioFilter || scenarioFilter.has(scenario.id)
);

if (!selectedScenarios.length) {
  console.error('No scenarios selected.');
  process.exit(1);
}
if (!variants.length) {
  console.error('No variants selected.');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

async function measurePacket(label, packet) {
  const startedAt = Date.now();
  const response = await client.responses.create({
    model,
    input: packet,
    text: {
      format: {
        type: 'json_schema',
        name: 'vtt_turn',
        schema: vttResponseSchema
      }
    }
  });
  const finishedAt = Date.now();
  return {
    label,
    ms: finishedAt - startedAt,
    bytes: Buffer.byteLength(packet, 'utf8'),
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens: response.usage?.total_tokens ?? null
  };
}

function average(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

for (const scenario of selectedScenarios) {
  const results = [];

  for (const variant of variants) {
    const packet = variant.build(scenario.state);
    const runsForVariant = [];
    for (let run = 0; run < runs; run += 1) {
      const measurement = await measurePacket(variant.id, packet);
      runsForVariant.push(measurement);
      console.log(`[run ${run + 1}/${runs}] ${scenario.id} ${variant.id}: ${measurement.ms}ms`);
    }
    results.push({
      variant: variant.id,
      bytes: runsForVariant[0].bytes,
      msAvg: average(runsForVariant.map((entry) => entry.ms)),
      inputTokensAvg: average(runsForVariant.map((entry) => entry.inputTokens || 0)),
      totalTokensAvg: average(runsForVariant.map((entry) => entry.totalTokens || 0))
    });
  }

  const baseline = results.find((entry) => entry.variant === 'full');
  const summary = results.map((entry) => ({
    scenario: scenario.id,
    variant: entry.variant,
    bytes: entry.bytes,
    msAvg: entry.msAvg,
    inputTokensAvg: entry.inputTokensAvg,
    totalTokensAvg: entry.totalTokensAvg,
    bytesSavedVsFull: baseline ? baseline.bytes - entry.bytes : 0,
    msSavedVsFull: baseline ? baseline.msAvg - entry.msAvg : 0
  }));

  console.table(summary);
  console.log(JSON.stringify({ scenario: scenario.id, runs, variants: summary }));
}
