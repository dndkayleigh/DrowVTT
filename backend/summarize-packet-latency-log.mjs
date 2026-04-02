import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node summarize-packet-latency-log.mjs <raw-log-path> [benchmark-name] [model-name]');
  process.exit(1);
}

const [, , rawLogArg, benchmarkNameArg, modelNameArg] = process.argv;
if (!rawLogArg) usage();

const rawLogPath = path.resolve(process.cwd(), rawLogArg);
if (!fs.existsSync(rawLogPath)) {
  console.error(`Raw log not found: ${rawLogPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(rawLogPath, 'utf8');
const lines = raw.split(/\r?\n/);

const runPattern = /^\[run (\d+)\/(\d+)\] ([^ ]+) ([^:]+): (\d+)ms$/;
const scenarioPattern = /^\{"scenario":"([^"]+)","runs":(\d+),"variants":(\[.+\])\}$/;

const runs = [];
const scenarioSummaries = [];

for (const line of lines) {
  const runMatch = line.match(runPattern);
  if (runMatch) {
    runs.push({
      scenario: runMatch[3],
      variant: runMatch[4],
      run_index: Number(runMatch[1]),
      total_runs: Number(runMatch[2]),
      tat_ms: Number(runMatch[5])
    });
    continue;
  }

  const scenarioMatch = line.match(scenarioPattern);
  if (scenarioMatch) {
    scenarioSummaries.push({
      scenario: scenarioMatch[1],
      runs: Number(scenarioMatch[2]),
      variants: JSON.parse(scenarioMatch[3])
    });
  }
}

if (!runs.length || !scenarioSummaries.length) {
  console.error('Could not parse run data and scenario summaries from raw log.');
  process.exit(1);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function stddev(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function round(value) {
  return Number(value.toFixed(2));
}

const variants = [...new Set(runs.map((entry) => entry.variant))];
const scenarios = [...new Set(runs.map((entry) => entry.scenario))];
const benchmarkName = benchmarkNameArg || path.basename(rawLogPath).replace(/\.raw\.log$/, '');

const fullRunsByScenario = new Map();
for (const scenario of scenarios) {
  const scenarioFullRuns = runs
    .filter((entry) => entry.scenario === scenario && entry.variant === 'full')
    .map((entry) => entry.tat_ms);
  fullRunsByScenario.set(scenario, scenarioFullRuns);
}

const overallVariants = variants.map((variant) => {
  const variantRuns = runs.filter((entry) => entry.variant === variant).map((entry) => entry.tat_ms);
  const savedVsFull = scenarios.flatMap((scenario) => {
    const fullValues = fullRunsByScenario.get(scenario) || [];
    const variantValues = runs
      .filter((entry) => entry.scenario === scenario && entry.variant === variant)
      .map((entry) => entry.tat_ms);
    return variantValues.map((value, index) => (fullValues[index] ?? value) - value);
  });
  const meanSaved = variant === 'full' ? 0 : mean(savedVsFull);
  const meanFullAcrossPairs = scenarios.flatMap((scenario) => fullRunsByScenario.get(scenario) || []);
  const baseline = mean(meanFullAcrossPairs);
  return {
    variant,
    count: variantRuns.length,
    mean_ms: round(mean(variantRuns)),
    median_ms: round(median(variantRuns)),
    min_ms: Math.min(...variantRuns),
    max_ms: Math.max(...variantRuns),
    stddev_ms: round(stddev(variantRuns)),
    mean_saved_vs_full_ms: round(meanSaved),
    mean_pct_faster_vs_full: variant === 'full' ? 0 : round((meanSaved / baseline) * 100)
  };
}).sort((left, right) => left.mean_ms - right.mean_ms);

const variantWinCounts = Object.fromEntries(variants.map((variant) => [variant, 0]));

const perScenario = scenarioSummaries.map((entry) => {
  const enrichedVariants = entry.variants.map((variantSummary) => {
    const variantRuns = runs
      .filter((run) => run.scenario === entry.scenario && run.variant === variantSummary.variant)
      .map((run) => run.tat_ms);
    const fullMean = entry.variants.find((item) => item.variant === 'full')?.msAvg ?? variantSummary.msAvg;
    const variantMean = mean(variantRuns);
    return {
      ...variantSummary,
      run_tat_ms: variantRuns,
      tat_stats: {
        count: variantRuns.length,
        mean_ms: round(variantMean),
        median_ms: round(median(variantRuns)),
        min_ms: Math.min(...variantRuns),
        max_ms: Math.max(...variantRuns),
        stddev_ms: round(stddev(variantRuns))
      },
      mean_pct_faster_vs_full: variantSummary.variant === 'full'
        ? 0
        : round(((fullMean - variantMean) / fullMean) * 100)
    };
  }).sort((left, right) => left.tat_stats.mean_ms - right.tat_stats.mean_ms);

  const best = enrichedVariants[0];
  variantWinCounts[best.variant] += 1;
  const fullMean = enrichedVariants.find((item) => item.variant === 'full')?.tat_stats.mean_ms ?? best.tat_stats.mean_ms;

  return {
    scenario: entry.scenario,
    runs: entry.runs,
    best_variant: best.variant,
    best_variant_mean_ms: best.tat_stats.mean_ms,
    full_mean_ms: fullMean,
    saved_vs_full_ms: round(fullMean - best.tat_stats.mean_ms),
    variants: enrichedVariants
  };
});

const payload = {
  benchmark_name: benchmarkName,
  generated_at_local: new Date().toISOString(),
  source_log: path.relative(process.cwd(), rawLogPath),
  model: modelNameArg || 'gpt-5',
  total_api_calls: runs.length,
  scenario_count: scenarios.length,
  variant_count: variants.length,
  runs_per_variant_per_scenario: runs[0]?.total_runs ?? null,
  fields: {
    tat_ms: 'Turn-around time in milliseconds measured around client.responses.create()'
  },
  overall_variants: overallVariants,
  variant_win_counts: variantWinCounts,
  per_scenario: perScenario,
  raw_runs: runs
};

const outputDir = path.dirname(rawLogPath);
const baseName = path.basename(rawLogPath, '.raw.log');
const summaryPath = path.join(outputDir, `${baseName}.summary.json`);
const runsCsvPath = path.join(outputDir, `${baseName}.runs.csv`);
const overallCsvPath = path.join(outputDir, `${baseName}.overall.csv`);

fs.writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);

const csvEscape = (value) => {
  if (value == null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const runCsvRows = [
  ['scenario', 'variant', 'run_index', 'total_runs', 'tat_ms'],
  ...runs.map((entry) => [entry.scenario, entry.variant, entry.run_index, entry.total_runs, entry.tat_ms])
];
fs.writeFileSync(runsCsvPath, `${runCsvRows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`);

const overallCsvRows = [
  ['variant', 'count', 'mean_ms', 'median_ms', 'min_ms', 'max_ms', 'stddev_ms', 'mean_saved_vs_full_ms', 'mean_pct_faster_vs_full'],
  ...overallVariants.map((entry) => [
    entry.variant,
    entry.count,
    entry.mean_ms,
    entry.median_ms,
    entry.min_ms,
    entry.max_ms,
    entry.stddev_ms,
    entry.mean_saved_vs_full_ms,
    entry.mean_pct_faster_vs_full
  ])
];
fs.writeFileSync(overallCsvPath, `${overallCsvRows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`);

console.log(JSON.stringify({
  summaryPath,
  runsCsvPath,
  overallCsvPath
}, null, 2));
