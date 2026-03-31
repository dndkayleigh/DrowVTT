import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const runs = Math.max(1, Number(process.env.RUNS || 3));
const variants = process.env.VARIANTS || 'full,compact_moves5,compact_moves5_attacks6';
const scenarios = process.env.SCENARIOS || '';
const models = (process.env.MODELS || 'gpt-5,gpt-5-mini,gpt-5.4-mini')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required to run model sweep latency measurements.');
  process.exit(1);
}

if (!models.length) {
  console.error('No models selected.');
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

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

const results = [];

for (const model of models) {
  const modelSlug = slugifyModel(model);
  const baseName = `packet-latency-${dateStamp}-${modelSlug}-runs${runs}`;
  const rawLogPath = path.join(benchmarkDir, `${baseName}.raw.log`);

  console.log(`\n=== Running latency sweep for ${model} ===`);

  const measure = await runCommand(
    'node',
    ['measure-packet-latency.mjs'],
    {
      cwd: process.cwd(),
      env: {
        OPENAI_MODEL: model,
        RUNS: String(runs),
        VARIANTS: variants,
        ...(scenarios ? { SCENARIOS: scenarios } : {})
      }
    }
  );

  fs.writeFileSync(rawLogPath, `${measure.stdout}${measure.stderr}`);

  if (measure.code !== 0) {
    results.push({
      model,
      ok: false,
      raw_log: path.relative(process.cwd(), rawLogPath),
      error: measure.stderr.trim() || `measure-packet-latency exited with code ${measure.code}`
    });
    continue;
  }

  const summaryJsonPath = path.join(benchmarkDir, `${baseName}.summary.json`);
  const runsCsvPath = path.join(benchmarkDir, `${baseName}.runs.csv`);
  const overallCsvPath = path.join(benchmarkDir, `${baseName}.overall.csv`);

  const summarize = await runCommand(
    'node',
    [
      'summarize-packet-latency-log.mjs',
      path.relative(process.cwd(), rawLogPath),
      `gpt-5_model_sweep_${modelSlug}`,
      model
    ],
    { cwd: process.cwd() }
  );

  if (summarize.code !== 0) {
    results.push({
      model,
      ok: false,
      raw_log: path.relative(process.cwd(), rawLogPath),
      error: summarize.stderr.trim() || `summarize-packet-latency-log exited with code ${summarize.code}`
    });
    continue;
  }

  results.push({
    model,
    ok: true,
    raw_log: path.relative(process.cwd(), rawLogPath),
    summary_json: path.relative(process.cwd(), summaryJsonPath),
    runs_csv: path.relative(process.cwd(), runsCsvPath),
    overall_csv: path.relative(process.cwd(), overallCsvPath)
  });
}

const reportPath = path.join(benchmarkDir, `packet-latency-${dateStamp}-model-sweep-report.json`);
fs.writeFileSync(reportPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  runs_per_variant_per_scenario: runs,
  variants: variants.split(',').map((value) => value.trim()).filter(Boolean),
  scenarios: scenarios ? scenarios.split(',').map((value) => value.trim()).filter(Boolean) : 'all',
  results
}, null, 2)}\n`);

console.log(`\nWrote model sweep report: ${reportPath}`);
