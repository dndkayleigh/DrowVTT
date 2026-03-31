import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { AI_PACKET_SCENARIOS } from './tests/ai-turn-packet-scenarios.fixture.mjs';

const outputDir = path.resolve(process.cwd(), 'benchmark-results', 'scenario-screenshots');
fs.mkdirSync(outputDir, { recursive: true });
const archivePath = path.resolve(process.cwd(), 'benchmark-results', 'captioned-output-archive-2026-03-29.json');

const selectedScenarioIds = AI_PACKET_SCENARIOS.map((scenario) => scenario.id);

const scenarioFindings = {
  'duel-goblin-vs-acolyte': 'Small duel scenario. Compact variants were dramatically faster here; the best run class cut average TAT by roughly 17 seconds versus `full`.',
  'ranged-bandit-crossfire': 'Spread-out ranged skirmish. Summarized compact packets performed best here, suggesting lighter token context can help when the board is simple but not crowded.',
  'crowded-ogre-frontline': 'Dense melee congestion case. This was the clearest counterexample to “smaller packet is always faster”: `full` was the fastest average performer.',
  'air-elemental-flank': 'High-mobility flanking board. `compact_moves5` was the best average latency performer here, beating `full` by about 18.7 seconds.',
  'boss-dragon-vs-party': 'Boss-turn stress case with a large statblock. `compact_moves5_attacks6` won this scenario on latency, showing that tighter legal move and attack windows can help on heavyweight turns.',
  'aboleth-control-web': 'Controller-style scenario with a long statblock. `compact_moves5` was clearly best here, implying move pruning can matter more than extra attack-window detail in control-heavy turns.'
};

const latencySummary = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'benchmark-results', 'packet-latency-2026-03-28-runs3.summary.json'), 'utf8')
);
const captionArchive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
const archivedTurnByScenario = new Map(
  (captionArchive.results || []).map((entry) => [entry.scenario, entry.parsed_response || null])
);

const latencyByScenario = new Map(
  latencySummary.per_scenario.map((scenario) => {
    const sorted = [...scenario.variants].sort((left, right) => left.msAvg - right.msAvg);
    const full = scenario.variants.find((entry) => entry.variant === 'full');
    return [scenario.scenario, {
      best: sorted[0],
      second: sorted[1],
      full
    }];
  })
);

function buildSnapshot(scenario) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      ...scenario.state,
      map: {
        src: '',
        w: 2048,
        h: 1536,
        offX: 0,
        offY: 0,
        scale: 1,
        rot: 0,
        opacity: 1
      },
      view: {
        zoom: 1.2,
        panX: 140,
        panY: 60
      }
    }
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

await page.goto('http://127.0.0.1:3000/');
await page.waitForFunction(() => window.__VTT_DEBUG__ != null);

const manifest = [];

for (const scenarioId of selectedScenarioIds) {
  const scenario = AI_PACKET_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) continue;

  const snapshot = buildSnapshot(scenario);
  await page.evaluate(async (snapshotText) => {
    await window.__VTT_DEBUG__.importBoardSnapshotText(snapshotText);
  }, JSON.stringify(snapshot));

  await page.evaluate(() => {
    document.querySelector('#aiDrawer')?.removeAttribute('open');
    document.querySelector('#tokensSection')?.removeAttribute('open');
    document.querySelector('#turnSection')?.setAttribute('open', '');
  });

  const archivedTurn = archivedTurnByScenario.get(scenarioId);
  if (archivedTurn) {
    await page.evaluate((turnJson) => {
      document.querySelector('#aiDrawer')?.setAttribute('open', '');
      document.querySelector('[data-drawer-tab="apply"]')?.click();
      const applyJson = document.querySelector('#applyJson');
      const applyButton = document.querySelector('#applyBtn');
      if (applyJson) applyJson.value = JSON.stringify(turnJson, null, 2);
      applyButton?.click();
    }, archivedTurn);
  }

  await page.waitForTimeout(300);

  const filename = `${scenarioId}.png`;
  const fullPath = path.join(outputDir, filename);
  await page.screenshot({ path: fullPath, fullPage: true });
  const latency = latencyByScenario.get(scenarioId);
  manifest.push({
    scenario: scenarioId,
    file: filename,
    finding: scenarioFindings[scenarioId] || '',
    latency
  });
}

await browser.close();

const markdown = [
  '# Benchmark Scenario Gallery',
  '',
  '> Representative benchmark boards with scenario-specific latency takeaways.',
  '',
  'Each screenshot below shows one benchmark scenario from the GPT-5 packet latency test suite. The caption under each image summarizes which packet variant won that scenario and how far ahead it finished compared with the `full` baseline.',
  ''
];

for (const entry of manifest) {
  const best = entry.latency?.best;
  const second = entry.latency?.second;
  const full = entry.latency?.full;
  markdown.push(`## \`${entry.scenario}\``);
  markdown.push('');
  markdown.push(`![${entry.scenario}](scenario-screenshots/${entry.file})`);
  markdown.push('');
  if (best && full) {
    const saved = full.msAvg - best.msAvg;
    markdown.push(`**Winner:** \`${best.variant}\` at **${(best.msAvg / 1000).toFixed(2)}s** average TAT.`);
    markdown.push('');
    if (saved > 0) {
      markdown.push(`**Delta vs \`full\`:** **${(saved / 1000).toFixed(2)}s faster** than \`full\` (${(full.msAvg / 1000).toFixed(2)}s).`);
      markdown.push('');
    } else {
      markdown.push(`**Delta vs \`full\`:** \`full\` was the fastest variant here at **${(full.msAvg / 1000).toFixed(2)}s**.`);
      markdown.push('');
    }
    if (second) {
      markdown.push(`**Runner-up:** \`${second.variant}\` at **${(second.msAvg / 1000).toFixed(2)}s** average TAT.`);
      markdown.push('');
    }
  }
  markdown.push(`**Finding:** ${entry.finding}`);
  markdown.push('');
  markdown.push('---');
  markdown.push('');
}

fs.writeFileSync(
  path.resolve(process.cwd(), 'benchmark-results', 'scenario-gallery.md'),
  `${markdown.join('\n')}\n`
);

console.log(JSON.stringify({
  outputDir,
  gallery: path.resolve(process.cwd(), 'benchmark-results', 'scenario-gallery.md'),
  screenshots: manifest
}, null, 2));
