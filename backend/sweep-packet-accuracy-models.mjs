import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const runs = Math.max(1, Number(process.env.RUNS || 3));
const variants = process.env.VARIANTS || 'compact_moves5';
const scenarios = process.env.SCENARIOS || '';
const models = (process.env.MODELS || 'gpt-5,gpt-5-mini,gpt-5.4-mini')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const groundTruthModel = process.env.GROUND_TRUTH_MODEL || 'gpt-5';
const groundTruthVariant = process.env.GROUND_TRUTH_VARIANT || 'full';
const judgeModel = process.env.JUDGE_MODEL || groundTruthModel;
const enableReasoningJudge = process.env.ENABLE_REASONING_JUDGE !== '0';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required to run model sweep accuracy measurements.');
  process.exit(1);
}

const benchmarkDir = path.resolve(process.cwd(), 'benchmark-results');
fs.mkdirSync(benchmarkDir, { recursive: true });
const dateStamp = new Date().toISOString().slice(0, 10);

function slugifyModel(model) {
  return model.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const results = [];

for (const model of models) {
  const modelSlug = slugifyModel(model);
  const baseName = `packet-accuracy-${dateStamp}-${modelSlug}-runs${runs}`;

  console.log(`\n=== Running accuracy sweep for ${model} ===`);

  const run = await runCommand(
    'node',
    ['measure-packet-accuracy.mjs'],
    {
      cwd: process.cwd(),
      env: {
        OPENAI_MODEL: model,
        RUNS: String(runs),
        VARIANTS: variants,
        OUTPUT_BASENAME: baseName,
        BENCHMARK_NAME: `gpt-5_accuracy_model_sweep_${modelSlug}`,
        GROUND_TRUTH_MODEL: groundTruthModel,
        GROUND_TRUTH_VARIANT: groundTruthVariant,
        JUDGE_MODEL: judgeModel,
        ENABLE_REASONING_JUDGE: enableReasoningJudge ? '1' : '0',
        ...(scenarios ? { SCENARIOS: scenarios } : {})
      }
    }
  );

  const rawLogPath = path.join(benchmarkDir, `${baseName}.raw.log`);
  fs.writeFileSync(rawLogPath, `${run.stdout}${run.stderr}`);

  results.push({
    model,
    ok: run.code === 0,
    raw_log: path.relative(process.cwd(), rawLogPath),
    json: `benchmark-results/${baseName}.json`,
    csv: `benchmark-results/${baseName}.csv`,
    error: run.code === 0 ? null : (run.stderr.trim() || `measure-packet-accuracy exited with code ${run.code}`)
  });

  if (run.code !== 0) break;
}

const reportPath = path.join(benchmarkDir, `packet-accuracy-${dateStamp}-model-sweep-report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  runs_per_variant_per_scenario: runs,
  variants: variants.split(',').map((value) => value.trim()).filter(Boolean),
  scenarios: scenarios ? scenarios.split(',').map((value) => value.trim()).filter(Boolean) : 'all',
  ground_truth_model: groundTruthModel,
  ground_truth_variant: groundTruthVariant,
  judge_model: enableReasoningJudge ? judgeModel : null,
  reasoning_judge_enabled: enableReasoningJudge,
  results
}, null, 2)}\n`);

console.log(`\nWrote accuracy model sweep report: ${reportPath}`);
