import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { buildAiTurnPacketCompactFromState, buildAiTurnPacketFromState } from '../data/ai-turn-packet-utils.mjs';
import { AI_PACKET_SCENARIOS } from './tests/ai-turn-packet-scenarios.fixture.mjs';
import { evaluateAiTurnResponse } from './ai-turn-eval-utils.mjs';
import { vttResponseSchema } from './vtt-response-schema.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY is required to archive captioned outputs.');
  process.exit(1);
}

const model = process.env.OPENAI_MODEL || 'gpt-5';
const client = new OpenAI({ apiKey });

const variantBuilders = {
  full: {
    compactOptions: null,
    build: (state) => buildAiTurnPacketFromState(state)
  },
  compact_base: {
    compactOptions: {},
    build: (state) => buildAiTurnPacketCompactFromState(state)
  },
  compact_moves5: {
    compactOptions: { moveCandidateLimit: 5 },
    build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5 })
  },
  compact_attacks6: {
    compactOptions: { attackOpportunityLimit: 6 },
    build: (state) => buildAiTurnPacketCompactFromState(state, { attackOpportunityLimit: 6 })
  },
  compact_summary: {
    compactOptions: { statblockMode: 'summary' },
    build: (state) => buildAiTurnPacketCompactFromState(state, { statblockMode: 'summary' })
  },
  compact_moves5_attacks6: {
    compactOptions: { moveCandidateLimit: 5, attackOpportunityLimit: 6 },
    build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 })
  },
  compact_moves5_summary: {
    compactOptions: { moveCandidateLimit: 5, statblockMode: 'summary' },
    build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, statblockMode: 'summary' })
  },
  compact_moves5_attacks6_summary: {
    compactOptions: { moveCandidateLimit: 5, attackOpportunityLimit: 6, statblockMode: 'summary' },
    build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6, statblockMode: 'summary' })
  }
};

const captionPairs = [
  ['duel-goblin-vs-acolyte', 'compact_moves5_attacks6_summary'],
  ['ranged-bandit-crossfire', 'compact_summary'],
  ['crowded-ogre-frontline', 'full'],
  ['air-elemental-flank', 'compact_moves5'],
  ['boss-dragon-vs-party', 'compact_moves5_attacks6'],
  ['aboleth-control-web', 'compact_moves5']
];

async function runOne(scenarioId, variantId) {
  const scenario = AI_PACKET_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  const variant = variantBuilders[variantId];
  if (!variant) throw new Error(`Unknown variant: ${variantId}`);

  const promptText = variant.build(scenario.state);
  const startedAt = Date.now();
  const response = await client.responses.create({
    model,
    input: promptText,
    text: {
      format: {
        type: 'json_schema',
        name: 'vtt_turn',
        schema: vttResponseSchema
      }
    }
  });
  const finishedAt = Date.now();
  const outputText = response.output_text ?? '';
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    parseError = error?.message ?? String(error);
  }

  const evaluation = parsed
    ? evaluateAiTurnResponse(scenario.state, parsed, { compactOptions: variant.compactOptions })
    : null;

  return {
    scenario: scenarioId,
    variant: variantId,
    model,
    prompt_text: promptText,
    output_text: outputText,
    parsed_response: parsed,
    parse_error: parseError,
    evaluation,
    tat_ms: finishedAt - startedAt,
    usage: {
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      total_tokens: response.usage?.total_tokens ?? null
    }
  };
}

const outDir = path.resolve(process.cwd(), 'benchmark-results');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `captioned-output-archive-${new Date().toISOString().slice(0, 10)}.json`);

function writeArchive(results, extra = {}) {
  fs.writeFileSync(outPath, `${JSON.stringify({
    benchmark_name: 'gpt-5_captioned_output_archive',
    generated_at: new Date().toISOString(),
    model,
    pair_count: results.length,
    completed: extra.completed ?? false,
    interrupted: extra.interrupted ?? false,
    interruption_reason: extra.interruption_reason ?? null,
    results
  }, null, 2)}\n`);
}

const results = [];
for (const [scenarioId, variantId] of captionPairs) {
  try {
    const result = await runOne(scenarioId, variantId);
    results.push(result);
    writeArchive(results, { completed: false });
    console.log(`[archived] ${scenarioId} ${variantId}: tat=${result.tat_ms}ms legal=${result.evaluation?.legalTurn ?? false}`);
  } catch (error) {
    writeArchive(results, {
      completed: false,
      interrupted: true,
      interruption_reason: error?.message ?? String(error)
    });
    console.error(JSON.stringify({
      outPath,
      interrupted: true,
      reason: error?.message ?? String(error)
    }, null, 2));
    throw error;
  }
}

writeArchive(results, { completed: true, interrupted: false });
console.log(JSON.stringify({ outPath }, null, 2));
