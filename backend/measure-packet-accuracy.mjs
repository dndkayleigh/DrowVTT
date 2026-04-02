import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import {
  buildAiTurnPacketCompactFromState,
  buildAiTurnPacketFromState,
  buildAiTurnPacketVerboseConstrainedFromState
} from '../data/ai-turn-packet-utils.mjs';
import { AI_PACKET_SCENARIOS } from './tests/ai-turn-packet-scenarios.fixture.mjs';
import { evaluateAiTurnResponse, validateAiTurnSchemaShape } from './ai-turn-eval-utils.mjs';
import { vttResponseSchema } from './vtt-response-schema.js';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY is required to run accuracy measurements.');
  process.exit(1);
}

const runs = Math.max(1, Number(process.env.RUNS || 1));
const model = process.env.OPENAI_MODEL || 'gpt-5';
const benchmarkName = process.env.BENCHMARK_NAME || `${model}_packet_accuracy`;
const outputBaseName = process.env.OUTPUT_BASENAME || `packet-accuracy-${new Date().toISOString().slice(0, 10)}-runs${runs}`;
const groundTruthModel = process.env.GROUND_TRUTH_MODEL || 'gpt-5';
const groundTruthVariantId = process.env.GROUND_TRUTH_VARIANT || 'full';
const judgeModel = process.env.JUDGE_MODEL || groundTruthModel;
const enableReasoningJudge = process.env.ENABLE_REASONING_JUDGE !== '0';

const scenarioFilter = process.env.SCENARIOS
  ? new Set(process.env.SCENARIOS.split(',').map((value) => value.trim()).filter(Boolean))
  : null;

const allVariants = [
  { id: 'full', compactOptions: null, build: (state) => buildAiTurnPacketFromState(state) },
  { id: 'full_moves5_attacks6', compactOptions: null, build: (state) => buildAiTurnPacketVerboseConstrainedFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 }) },
  { id: 'compact_base', compactOptions: {}, build: (state) => buildAiTurnPacketCompactFromState(state) },
  { id: 'compact_moves5', compactOptions: { moveCandidateLimit: 5 }, build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5 }) },
  { id: 'compact_attacks6', compactOptions: { attackOpportunityLimit: 6 }, build: (state) => buildAiTurnPacketCompactFromState(state, { attackOpportunityLimit: 6 }) },
  { id: 'compact_summary', compactOptions: { statblockMode: 'summary' }, build: (state) => buildAiTurnPacketCompactFromState(state, { statblockMode: 'summary' }) },
  { id: 'compact_moves5_attacks6', compactOptions: { moveCandidateLimit: 5, attackOpportunityLimit: 6 }, build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6 }) },
  { id: 'compact_moves5_summary', compactOptions: { moveCandidateLimit: 5, statblockMode: 'summary' }, build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, statblockMode: 'summary' }) },
  { id: 'compact_moves5_attacks6_summary', compactOptions: { moveCandidateLimit: 5, attackOpportunityLimit: 6, statblockMode: 'summary' }, build: (state) => buildAiTurnPacketCompactFromState(state, { moveCandidateLimit: 5, attackOpportunityLimit: 6, statblockMode: 'summary' }) }
];

const variantById = new Map(allVariants.map((variant) => [variant.id, variant]));
const groundTruthVariant = variantById.get(groundTruthVariantId);
if (!groundTruthVariant) {
  console.error(`Unknown GROUND_TRUTH_VARIANT: ${groundTruthVariantId}`);
  process.exit(1);
}

const variantFilter = process.env.VARIANTS
  ? new Set(process.env.VARIANTS.split(',').map((value) => value.trim()).filter(Boolean))
  : null;
const variants = allVariants.filter((variant) => !variantFilter || variantFilter.has(variant.id));
const selectedScenarios = AI_PACKET_SCENARIOS.filter((scenario) => !scenarioFilter || scenarioFilter.has(scenario.id));

if (!selectedScenarios.length) {
  console.error('No scenarios selected.');
  process.exit(1);
}
if (!variants.length) {
  console.error('No variants selected.');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

const judgeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    agreement_score: { type: 'integer', minimum: 1, maximum: 5 },
    candidate_acceptable: { type: 'boolean' },
    major_tactical_miss: { type: 'boolean' },
    dodge_justified: { type: 'boolean' },
    follows_ground_truth_plan: { type: 'boolean' },
    rationale: { type: 'string' }
  },
  required: [
    'agreement_score',
    'candidate_acceptable',
    'major_tactical_miss',
    'dodge_justified',
    'follows_ground_truth_plan',
    'rationale'
  ]
};

function average(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function ratio(entries, key) {
  if (!entries.length) return 0;
  const matches = entries.filter((entry) => entry[key]).length;
  return Number((matches / entries.length).toFixed(4));
}

async function measurePacket(modelName, packet) {
  const startedAt = Date.now();
  const response = await client.responses.create({
    model: modelName,
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
  const outputText = response.output_text ?? '';
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    parseError = error?.message ?? String(error);
  }

  return {
    tatMs: finishedAt - startedAt,
    outputText,
    parsed,
    parseError,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens: response.usage?.total_tokens ?? null
  };
}

async function judgeAgainstGroundTruth({ scenario, groundTruth, candidate }) {
  if (!enableReasoningJudge || !groundTruth?.parsed_response || !candidate?.response) return null;

  const input = [
    'You are evaluating tactical accuracy for a D&D 5e combat turn.',
    '',
    `Scenario: ${scenario.id}`,
    '',
    'Board and rules context:',
    groundTruth.packet_text,
    '',
    'Ground-truth turn from the strongest reasoning setup:',
    JSON.stringify(groundTruth.parsed_response, null, 2),
    '',
    'Ground-truth legality and tactical evaluation:',
    JSON.stringify({
      legalTurn: groundTruth.evaluation.legalTurn,
      tacticalSound: groundTruth.evaluation.tacticalSound,
      dodgeInMeleeWithoutAttack: groundTruth.evaluation.dodgeInMeleeWithoutAttack,
      issues: groundTruth.evaluation.issues
    }, null, 2),
    '',
    'Candidate turn:',
    JSON.stringify(candidate.response, null, 2),
    '',
    'Candidate legality and tactical evaluation:',
    JSON.stringify({
      legalTurn: candidate.legal_turn,
      tacticalSound: candidate.tactical_sound,
      dodgeInMeleeWithoutAttack: candidate.dodge_in_melee_without_attack,
      meleeAttackOptionsAtEnd: candidate.melee_attack_options_at_end,
      issues: candidate.issues
    }, null, 2),
    '',
    'Judge instructions:',
    '- Do not require the candidate to be identical to the ground-truth turn.',
    '- A candidate can be acceptable if it is legal and tactically comparable, even if it chooses a different line.',
    '- Mark major_tactical_miss=true when the candidate obviously wastes tempo, ignores a clear attack, or is meaningfully worse than the reference.',
    '- If the candidate took Dodge while already having a legal melee attack, only mark dodge_justified=true if that choice is still tactically defensible from the board state.',
    '- Use agreement_score 5 for equivalent or near-equivalent tactical quality; 1 for clearly bad.'
  ].join('\n');

  try {
    const response = await client.responses.create({
      model: judgeModel,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'turn_accuracy_judgment',
          schema: judgeSchema
        }
      }
    });

    return JSON.parse(response.output_text || '{}');
  } catch (error) {
    return {
      agreement_score: null,
      candidate_acceptable: null,
      major_tactical_miss: null,
      dodge_justified: null,
      follows_ground_truth_plan: null,
      rationale: `Judge failed: ${error?.message ?? String(error)}`
    };
  }
}

function buildRunRecord({ scenario, variant, runIndex, packet, measurement, evaluation, judgment, groundTruth }) {
  return {
    scenario: scenario.id,
    variant: variant.id,
    model,
    run_index: runIndex,
    packet_bytes: Buffer.byteLength(packet, 'utf8'),
    tat_ms: measurement.tatMs,
    input_tokens: measurement.inputTokens,
    output_tokens: measurement.outputTokens,
    total_tokens: measurement.totalTokens,
    valid_json: measurement.parseError == null,
    schema_valid: evaluation?.schemaValid ?? false,
    moves_legal: evaluation?.movesLegal ?? false,
    actions_legal: evaluation?.actionsLegal ?? false,
    legal_turn: evaluation?.legalTurn ?? false,
    tactical_sound: evaluation?.tacticalSound ?? false,
    dodge_in_melee_without_attack: evaluation?.dodgeInMeleeWithoutAttack ?? false,
    melee_attack_options_at_end: evaluation?.meleeAttackOptionsAtEnd ?? 0,
    move_candidate_match: evaluation?.moveCandidateMatch,
    attack_candidate_match: evaluation?.attackCandidateMatch,
    judge_agreement_score: judgment?.agreement_score ?? null,
    judge_candidate_acceptable: judgment?.candidate_acceptable ?? null,
    judge_major_tactical_miss: judgment?.major_tactical_miss ?? null,
    judge_dodge_justified: judgment?.dodge_justified ?? null,
    judge_follows_ground_truth_plan: judgment?.follows_ground_truth_plan ?? null,
    judge_rationale: judgment?.rationale ?? null,
    ground_truth_model: groundTruth?.model ?? groundTruthModel,
    ground_truth_variant: groundTruth?.variant ?? groundTruthVariantId,
    move_count: evaluation?.moveCount ?? 0,
    action_count: evaluation?.actionCount ?? 0,
    issues: evaluation?.issues ?? (measurement.parseError ? [measurement.parseError] : []),
    response: measurement.parsed
  };
}

function summarizeVariantRuns(records) {
  const judged = records.filter((entry) => Number.isFinite(entry.judge_agreement_score));
  return {
    count: records.length,
    avg_tat_ms: average(records.map((entry) => entry.tat_ms).filter((value) => value != null)),
    avg_input_tokens: average(records.map((entry) => entry.input_tokens || 0)),
    avg_total_tokens: average(records.map((entry) => entry.total_tokens || 0)),
    valid_json_rate: ratio(records, 'valid_json'),
    schema_valid_rate: ratio(records, 'schema_valid'),
    legal_turn_rate: ratio(records, 'legal_turn'),
    tactical_sound_rate: ratio(records, 'tactical_sound'),
    dodge_in_melee_without_attack_rate: ratio(records, 'dodge_in_melee_without_attack'),
    judge_candidate_acceptable_rate: ratio(records.filter((entry) => entry.judge_candidate_acceptable != null), 'judge_candidate_acceptable'),
    judge_major_tactical_miss_rate: ratio(records.filter((entry) => entry.judge_major_tactical_miss != null), 'judge_major_tactical_miss'),
    avg_judge_agreement_score: average(judged.map((entry) => entry.judge_agreement_score)),
    moves_legal_rate: ratio(records, 'moves_legal'),
    actions_legal_rate: ratio(records, 'actions_legal'),
    move_candidate_match_rate: ratio(records.filter((entry) => entry.move_candidate_match != null), 'move_candidate_match'),
    attack_candidate_match_rate: ratio(records.filter((entry) => entry.attack_candidate_match != null), 'attack_candidate_match')
  };
}

function writeArtifacts(payload) {
  const benchmarkDir = path.resolve(process.cwd(), 'benchmark-results');
  fs.mkdirSync(benchmarkDir, { recursive: true });
  const jsonPath = path.join(benchmarkDir, `${outputBaseName}.json`);
  const csvPath = path.join(benchmarkDir, `${outputBaseName}.csv`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  function csvValue(value) {
    if (value == null) return '';
    const text = String(value);
    if (!/[",\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
  }

  const rows = [
    [
      'scenario',
      'variant',
      'model',
      'run_index',
      'packet_bytes',
      'tat_ms',
      'input_tokens',
      'output_tokens',
      'total_tokens',
      'valid_json',
      'schema_valid',
      'moves_legal',
      'actions_legal',
      'legal_turn',
      'tactical_sound',
      'dodge_in_melee_without_attack',
      'melee_attack_options_at_end',
      'move_candidate_match',
      'attack_candidate_match',
      'judge_agreement_score',
      'judge_candidate_acceptable',
      'judge_major_tactical_miss',
      'judge_dodge_justified',
      'judge_follows_ground_truth_plan',
      'move_count',
      'action_count',
      'issues'
    ],
    ...payload.runs.map((entry) => [
      entry.scenario,
      entry.variant,
      entry.model,
      entry.run_index,
      entry.packet_bytes,
      entry.tat_ms,
      entry.input_tokens ?? '',
      entry.output_tokens ?? '',
      entry.total_tokens ?? '',
      entry.valid_json,
      entry.schema_valid,
      entry.moves_legal,
      entry.actions_legal,
      entry.legal_turn,
      entry.tactical_sound,
      entry.dodge_in_melee_without_attack,
      entry.melee_attack_options_at_end,
      entry.move_candidate_match == null ? '' : entry.move_candidate_match,
      entry.attack_candidate_match == null ? '' : entry.attack_candidate_match,
      entry.judge_agreement_score ?? '',
      entry.judge_candidate_acceptable == null ? '' : entry.judge_candidate_acceptable,
      entry.judge_major_tactical_miss == null ? '' : entry.judge_major_tactical_miss,
      entry.judge_dodge_justified == null ? '' : entry.judge_dodge_justified,
      entry.judge_follows_ground_truth_plan == null ? '' : entry.judge_follows_ground_truth_plan,
      entry.move_count,
      entry.action_count,
      JSON.stringify(entry.issues)
    ])
  ];
  fs.writeFileSync(csvPath, `${rows.map((row) => row.map(csvValue).join(',')).join('\n')}\n`);

  return { jsonPath, csvPath };
}

function buildFailedRunRecord({ scenario, variant, runIndex, packet, error, groundTruth }) {
  return {
    scenario: scenario.id,
    variant: variant.id,
    model,
    run_index: runIndex,
    packet_bytes: Buffer.byteLength(packet, 'utf8'),
    tat_ms: null,
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    valid_json: false,
    schema_valid: false,
    moves_legal: false,
    actions_legal: false,
    legal_turn: false,
    tactical_sound: false,
    dodge_in_melee_without_attack: false,
    melee_attack_options_at_end: 0,
    move_candidate_match: null,
    attack_candidate_match: null,
    judge_agreement_score: null,
    judge_candidate_acceptable: null,
    judge_major_tactical_miss: null,
    judge_dodge_justified: null,
    judge_follows_ground_truth_plan: null,
    judge_rationale: null,
    ground_truth_model: groundTruth?.model ?? groundTruthModel,
    ground_truth_variant: groundTruth?.variant ?? groundTruthVariantId,
    move_count: 0,
    action_count: 0,
    issues: [error?.message ?? String(error)],
    response: null,
    error: {
      status: error?.status ?? null,
      code: error?.code ?? null,
      type: error?.type ?? null,
      message: error?.message ?? String(error)
    }
  };
}

function fallbackEvaluation(parseError) {
  return {
    schemaValid: false,
    movesLegal: false,
    actionsLegal: false,
    legalTurn: false,
    tacticalSound: false,
    dodgeInMeleeWithoutAttack: false,
    meleeAttackOptionsAtEnd: 0,
    moveCandidateMatch: null,
    attackCandidateMatch: null,
    moveCount: 0,
    actionCount: 0,
    issues: [parseError || 'Response did not parse as JSON.']
  };
}

async function buildGroundTruthForScenario(scenario) {
  const packet = groundTruthVariant.build(scenario.state);
  const measurement = await measurePacket(groundTruthModel, packet);
  const evaluation = measurement.parsed
    ? evaluateAiTurnResponse(scenario.state, measurement.parsed, { compactOptions: groundTruthVariant.compactOptions })
    : fallbackEvaluation(measurement.parseError);

  return {
    scenario: scenario.id,
    model: groundTruthModel,
    variant: groundTruthVariant.id,
    packet_text: packet,
    packet_bytes: Buffer.byteLength(packet, 'utf8'),
    tat_ms: measurement.tatMs,
    input_tokens: measurement.inputTokens,
    output_tokens: measurement.outputTokens,
    total_tokens: measurement.totalTokens,
    output_text: measurement.outputText,
    parsed_response: measurement.parsed,
    evaluation
  };
}

const payload = {
  benchmark_name: benchmarkName,
  generated_at: new Date().toISOString(),
  model,
  ground_truth_model: groundTruthModel,
  ground_truth_variant: groundTruthVariant.id,
  judge_model: enableReasoningJudge ? judgeModel : null,
  reasoning_judge_enabled: enableReasoningJudge,
  runs_per_variant_per_scenario: runs,
  scenario_count: selectedScenarios.length,
  variant_count: variants.length,
  completed: false,
  interrupted: false,
  interruption_reason: null,
  ground_truths: [],
  summary: [],
  runs: []
};

let artifactPaths = null;

for (const scenario of selectedScenarios) {
  const perScenario = [];
  let groundTruth;
  try {
    groundTruth = await buildGroundTruthForScenario(scenario);
    payload.ground_truths = payload.ground_truths
      .filter((entry) => entry.scenario !== scenario.id)
      .concat([groundTruth]);
    artifactPaths = writeArtifacts(payload);
    console.log(`[ground-truth] ${scenario.id}: legal_turn=${groundTruth.evaluation.legalTurn} tactical_sound=${groundTruth.evaluation.tacticalSound} tat=${groundTruth.tat_ms}ms`);
  } catch (error) {
    payload.interrupted = true;
    payload.interruption_reason = `Ground truth failed for ${scenario.id}: ${error?.message ?? String(error)}`;
    artifactPaths = writeArtifacts(payload);
    console.error(JSON.stringify({ interrupted: true, reason: payload.interruption_reason, ...artifactPaths }, null, 2));
    process.exit(1);
  }

  for (const variant of variants) {
    const packet = variant.build(scenario.state);
    const variantRecords = [];
    for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
      let measurement;
      try {
        measurement = await measurePacket(model, packet);
      } catch (error) {
        const failedRecord = buildFailedRunRecord({ scenario, variant, runIndex, packet, error, groundTruth });
        variantRecords.push(failedRecord);
        payload.runs.push(failedRecord);
        payload.interrupted = true;
        payload.interruption_reason = error?.message ?? String(error);
        perScenario.push({
          scenario: scenario.id,
          variant: variant.id,
          packet_bytes: Buffer.byteLength(packet, 'utf8'),
          ...summarizeVariantRuns(variantRecords)
        });
        payload.summary = payload.summary
          .filter((entry) => !(entry.scenario === scenario.id && entry.variant === variant.id))
          .concat(perScenario);
        artifactPaths = writeArtifacts(payload);
        console.error(JSON.stringify({ interrupted: true, reason: payload.interruption_reason, ...artifactPaths }, null, 2));
        process.exit(1);
      }

      const schemaShape = measurement.parsed
        ? validateAiTurnSchemaShape(measurement.parsed)
        : { ok: false, issues: [measurement.parseError || 'Response did not parse as JSON.'] };
      const evaluation = measurement.parsed
        ? evaluateAiTurnResponse(scenario.state, measurement.parsed, { compactOptions: variant.compactOptions })
        : fallbackEvaluation(schemaShape.issues[0]);
      const provisionalRecord = buildRunRecord({
        scenario,
        variant,
        runIndex,
        packet,
        measurement,
        evaluation,
        judgment: null,
        groundTruth
      });
      const judgment = await judgeAgainstGroundTruth({
        scenario,
        groundTruth,
        candidate: provisionalRecord
      });
      const record = buildRunRecord({
        scenario,
        variant,
        runIndex,
        packet,
        measurement,
        evaluation,
        judgment,
        groundTruth
      });
      variantRecords.push(record);
      payload.runs.push(record);
      console.log(
        `[run ${runIndex}/${runs}] ${scenario.id} ${variant.id}: legal_turn=${record.legal_turn} tactical_sound=${record.tactical_sound} judge_ok=${record.judge_candidate_acceptable} tat=${record.tat_ms}ms`
      );
    }

    const summary = summarizeVariantRuns(variantRecords);
    perScenario.push({
      scenario: scenario.id,
      variant: variant.id,
      packet_bytes: Buffer.byteLength(packet, 'utf8'),
      ...summary
    });
    payload.summary = payload.summary
      .filter((entry) => !(entry.scenario === scenario.id && entry.variant === variant.id))
      .concat([{ scenario: scenario.id, variant: variant.id, packet_bytes: Buffer.byteLength(packet, 'utf8'), ...summary }]);
    artifactPaths = writeArtifacts(payload);
  }
  console.table(perScenario);
}

payload.completed = true;
artifactPaths = writeArtifacts(payload);
const { jsonPath, csvPath } = artifactPaths;
console.log(JSON.stringify({ jsonPath, csvPath }, null, 2));
