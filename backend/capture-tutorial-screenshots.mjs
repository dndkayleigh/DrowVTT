import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const outputDir = path.resolve(process.cwd(), '..', 'screenshots', 'tutorial');
fs.mkdirSync(outputDir, { recursive: true });

function createToken({
  id,
  name,
  type,
  color,
  x,
  y,
  ac = 15,
  hp = '12',
  speed = 30,
  notes = '',
  statblock = ''
}) {
  return {
    id,
    name,
    type,
    sizeCells: 1,
    color,
    x,
    y,
    ac,
    hp,
    speed,
    notes,
    statblock,
    art: null
  };
}

function buildSnapshot({
  selectedTokenIds = [],
  currentTurnTokenId = null,
  aiGroupTokenIds = [],
  aiControls = 'Monsters'
} = {}) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      gridSize: 64,
      snapMode: 'center',
      view: {
        zoom: 0.9,
        panX: 10,
        panY: 10
      },
      map: {
        src: '/maps/crumbling-gate-nogrid.png',
        w: 1792,
        h: 1024,
        offX: 0,
        offY: 0,
        scale: 0.78,
        rot: 0,
        opacity: 0.92
      },
      tokens: [
        createToken({
          id: 'hero',
          name: 'Aria',
          type: 'PC',
          color: '#4dabf7',
          x: 224,
          y: 608,
          ac: 16,
          hp: '24',
          speed: 30,
          notes: 'Longsword and shield',
          statblock: 'Human fighter with longsword and shield.'
        }),
        createToken({
          id: 'goblin-a',
          name: 'Goblin A',
          type: 'Monster',
          color: '#ff6b6b',
          x: 736,
          y: 416,
          ac: 15,
          hp: '7',
          speed: 30,
          notes: 'Skirmisher',
          statblock: 'Goblin with scimitar and shortbow.'
        }),
        createToken({
          id: 'goblin-b',
          name: 'Goblin B',
          type: 'Monster',
          color: '#ff8787',
          x: 864,
          y: 352,
          ac: 15,
          hp: '7',
          speed: 30,
          notes: 'Flanker',
          statblock: 'Goblin with scimitar and shortbow.'
        }),
        createToken({
          id: 'goblin-c',
          name: 'Goblin C',
          type: 'Monster',
          color: '#ffa94d',
          x: 992,
          y: 480,
          ac: 15,
          hp: '7',
          speed: 30,
          notes: 'Ranged support',
          statblock: 'Goblin with scimitar and shortbow.'
        })
      ],
      selectedTokenId: selectedTokenIds[0] ?? null,
      selectedTokenIds,
      currentTurnTokenId,
      aiGroupTokenIds,
      aiControls,
      round: 1
    }
  };
}

async function setTutorialUi(page, { strategy, drawerTab = 'settings' }) {
  await page.evaluate(({ strategy, drawerTab }) => {
    const openDetails = (selector) => {
      const details = document.querySelector(selector);
      if (details) details.open = true;
    };
    openDetails('#turnSection');
    openDetails('#tokensSection');
    openDetails('#aiDrawer');
    const tabButton = document.querySelector(`[data-drawer-tab="${drawerTab}"]`);
    if (tabButton) tabButton.click();
    const strategySelect = document.querySelector('#aiStrategy');
    if (strategySelect) {
      strategySelect.value = strategy;
      strategySelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { strategy, drawerTab });
}

async function importSnapshot(page, snapshot) {
  await page.evaluate(async (snapshotText) => {
    await window.__VTT_DEBUG__.importBoardSnapshotText(snapshotText);
  }, JSON.stringify(snapshot));
}

async function capture(page, fileName) {
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: true
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1320 } });

await page.goto('http://127.0.0.1:3000/');
await page.waitForFunction(() => window.__VTT_DEBUG__ != null);

await importSnapshot(page, buildSnapshot({
  selectedTokenIds: ['goblin-a'],
  currentTurnTokenId: 'goblin-a'
}));
await setTutorialUi(page, { strategy: 'single_fast', drawerTab: 'settings' });
await capture(page, 'tutorial-board-setup.png');

await importSnapshot(page, buildSnapshot({
  selectedTokenIds: ['goblin-a'],
  currentTurnTokenId: 'goblin-a'
}));
await setTutorialUi(page, { strategy: 'single_tactical', drawerTab: 'settings' });
await capture(page, 'tutorial-single-tactical.png');

await importSnapshot(page, buildSnapshot({
  selectedTokenIds: ['goblin-a', 'goblin-b', 'goblin-c'],
  currentTurnTokenId: 'goblin-a',
  aiGroupTokenIds: ['goblin-a', 'goblin-b', 'goblin-c']
}));
await setTutorialUi(page, { strategy: 'group_tactical', drawerTab: 'settings' });
await capture(page, 'tutorial-group-tactical.png');

await browser.close();

console.log(JSON.stringify({
  outputDir,
  files: [
    'tutorial-board-setup.png',
    'tutorial-single-tactical.png',
    'tutorial-group-tactical.png'
  ]
}, null, 2));
