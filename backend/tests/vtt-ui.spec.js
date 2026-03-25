import { test, expect } from '@playwright/test';

async function openDetails(page, selector) {
  const details = page.locator(selector);
  if ((await details.getAttribute('open')) !== null) return;
  await details.evaluate((el) => { el.open = true; });
}

async function openDrawerTab(page, tab) {
  await openDetails(page, '#aiDrawer');
  await page.locator(`[data-drawer-tab="${tab}"]`).click();
}

async function clearTokens(page) {
  await openDetails(page, '#tokensSection');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);
}

async function addToken(page, { name, size, type = 'Monster' }) {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill(name);
  await page.locator('#tokType').selectOption(type);
  await page.locator('#tokSize').selectOption(String(size));
  await page.getByRole('button', { name: 'Add token' }).click();
}

async function dragTokenToTopLeftCell(page, { size, cellX, cellY }) {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const spawnCell = Math.round((70 / 64) - (size / 2));
  const startCenter = 64 * (spawnCell + (size / 2));
  const endX = 64 * (cellX + (size / 2));
  const endY = 64 * (cellY + (size / 2));

  await page.mouse.move(box.x + startCenter, box.y + startCenter);
  await page.mouse.down();
  await page.mouse.move(box.x + endX, box.y + endY, { steps: 12 });
  await page.mouse.up();
}

async function expectTokenCell(page, name, x, y) {
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: name })).toContainText(`(${x},${y})`);
}

async function setCurrentTurnToken(page, name) {
  await openDetails(page, '#turnSection');
  const option = page.locator('#turnToken option').filter({ hasText: name }).first();
  await page.locator('#turnToken').selectOption(await option.getAttribute('value'));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Web VTT Prototype/);
  await clearTokens(page);
});

test('loads the VTT UI', async ({ page }) => {
  await expect(page.locator('#gridSize')).toHaveValue('64');
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#apiUrl')).toHaveValue(/http:\/\/localhost:3000\/api\/vtt/);
  await expect(page.locator('canvas')).toBeVisible();
});

test('AI drawer defaults to compact controls with autopilot on and no tab expanded', async ({ page }) => {
  const drawer = page.locator('#aiDrawer');
  await expect(drawer).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Run AI' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();
  await expect(page.getByText('Autopilot')).toBeVisible();

  for (const tab of ['packet', 'settings', 'apply', 'log']) {
    await expect(page.locator(`[data-drawer-tab="${tab}"]`)).toBeVisible();
    await expect(page.locator(`[data-drawer-panel="${tab}"]`)).toBeHidden();
  }
});

test('AI drawer tabs open one panel at a time and clicking the active tab collapses back to compact mode', async ({ page }) => {
  await openDetails(page, '#aiDrawer');

  await page.locator('[data-drawer-tab="packet"]').click();
  await expect(page.locator('[data-drawer-panel="packet"]')).toBeVisible();
  await expect(page.locator('[data-drawer-panel="settings"]')).toBeHidden();

  await page.locator('[data-drawer-tab="settings"]').click();
  await expect(page.locator('[data-drawer-panel="settings"]')).toBeVisible();
  await expect(page.locator('[data-drawer-panel="packet"]')).toBeHidden();

  await page.locator('[data-drawer-tab="settings"]').click();
  for (const tab of ['packet', 'settings', 'apply', 'log']) {
    await expect(page.locator(`[data-drawer-panel="${tab}"]`)).toBeHidden();
  }
  await expect(page.getByRole('button', { name: 'Run AI' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();
});

test('AI drawer persistent controls remain usable regardless of which tab is open', async ({ page }) => {
  await openDrawerTab(page, 'packet');
  await page.locator('#autoApplyAI').uncheck();
  await expect(page.locator('#autoApplyAI')).not.toBeChecked();

  await openDrawerTab(page, 'settings');
  await expect(page.locator('#autoApplyAI')).not.toBeChecked();
  await page.locator('#autoApplyAI').check();
  await expect(page.locator('#autoApplyAI')).toBeChecked();

  await openDrawerTab(page, 'apply');
  await expect(page.getByRole('button', { name: 'Run AI' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();

  await openDrawerTab(page, 'log');
  await expect(page.getByRole('button', { name: 'Run AI' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();
});

test('AI drawer settings persist across tab changes', async ({ page }) => {
  await openDrawerTab(page, 'settings');
  await page.locator('#apiUrl').fill('http://localhost:3000/api/custom');
  await page.locator('#aiModel').selectOption('gpt-5');

  await openDrawerTab(page, 'packet');
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#apiUrl')).toHaveValue('http://localhost:3000/api/custom');
  await expect(page.locator('#aiModel')).toHaveValue('gpt-5');
});

test('monster name autocomplete shows matching SRD suggestions and clicking one fills the input', async ({ page }) => {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill('acol');
  const suggestions = page.locator('#monsterAutocomplete .autocompleteItem');
  const suggestionCount = await suggestions.count();
  expect(suggestionCount).toBeGreaterThan(0);
  expect(suggestionCount).toBeLessThanOrEqual(4);
  await expect(suggestions.filter({ hasText: 'Acolyte' })).toHaveCount(1);
  await suggestions.filter({ hasText: 'Acolyte' }).first().evaluate((el) => el.click());
  await expect(page.locator('#tokName')).toHaveValue('Acolyte');
});

test('expanded SRD roster includes monsters beyond the starter set', async ({ page }) => {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill('abo');
  const suggestions = page.locator('#monsterAutocomplete .autocompleteItem');
  await expect(suggestions.filter({ hasText: 'Aboleth' })).toHaveCount(1);

  await page.locator('#tokName').fill('Acolyte');
  await page.locator('#addToken').click();

  await openDetails(page, '#turnSection');
  await expect(page.locator('#selAC')).toHaveValue('10');
  await expect(page.locator('#selHP')).toHaveValue('9/9');
  await expect(page.locator('#selSpeed')).toHaveValue('30');
  await expect(page.locator('#selSize')).toHaveValue('1');

  await page.locator('[data-turn-tab="statblock"]').click();
  await expect(page.locator('#selStatblock')).toHaveValue(/Acolyte \(SRD 5\.1\)/);
  await expect(page.locator('#selStatblock')).toHaveValue(/Club/);
});

test('adding an exact SRD monster name uses its SRD statblock and stats', async ({ page }) => {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill('Ogre');
  await page.locator('#addToken').click();

  await openDetails(page, '#turnSection');
  await expect(page.locator('#selAC')).toHaveValue('11');
  await expect(page.locator('#selHP')).toHaveValue('59/59');
  await expect(page.locator('#selSpeed')).toHaveValue('40');
  await expect(page.locator('#selSize')).toHaveValue('2');
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Ogre' })).toContainText('2×2');
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Ogre' })).toHaveAttribute('title', /Ogre \(SRD 5\.1\)/);

  await page.locator('[data-turn-tab="statblock"]').click();
  await expect(page.locator('#selStatblock')).toHaveValue(/Ogre \(SRD 5.1\)/);
  await expect(page.locator('#selStatblock')).toHaveValue(/Greatclub/);
});

test('adding a custom monster name keeps the custom monster statblock editable', async ({ page }) => {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill('Goblin Boss');
  await page.locator('#tokSize').selectOption('3');
  await page.locator('#addToken').click();

  await openDetails(page, '#turnSection');
  await expect(page.locator('#selAC')).toHaveValue('15');
  await expect(page.locator('#selHP')).toHaveValue('7/7');
  await expect(page.locator('#selSpeed')).toHaveValue('30');
  await expect(page.locator('#selSize')).toHaveValue('3');
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Goblin Boss' })).toContainText('3×3');

  await page.locator('[data-turn-tab="statblock"]').click();
  await expect(page.locator('#selStatblock')).toHaveValue(/Custom Monster/);
  await expect(page.locator('#selStatblock')).not.toHaveValue(/Goblin \(SRD 5\.1\)/);

  await page.locator('#selStatblock').fill('Custom Boss\n- Actions:\n  - Smash');
  await expect(page.locator('#selStatblock')).toHaveValue(/Custom Boss/);
});

test('1x1 tokens snap to the center of a single tile', async ({ page }) => {
  await addToken(page, { name: 'Scout', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 5, cellY: 2 });
  await expectTokenCell(page, 'Scout', 5, 2);
});

test('left-click dragging a non-current token moves it in one gesture', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 1 });

  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 3, cellY: 1 });
  await expectTokenCell(page, 'Goblin A', 3, 1);

  await setCurrentTurnToken(page, 'Hero');
  await expect(page.locator('#turnToken option:checked')).toContainText('Hero');

  const row = page.locator('#tokenList .tokRow').filter({ hasText: 'Goblin A' });
  await expect(row).toContainText('(3,1)');

  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const startX = box.x + 64 * (3 + 0.5);
  const startY = box.y + 64 * (1 + 0.5);
  const endX = box.x + 64 * (5 + 0.5);
  const endY = box.y + 64 * (1 + 0.5);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();

  await expectTokenCell(page, 'Goblin A', 5, 1);
  await expect(page.locator('#turnToken option:checked')).toContainText('Goblin A');
});

test('new duplicate creature names auto-increment by letter', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1 });
  await addToken(page, { name: 'Goblin A', size: 1 });
  await addToken(page, { name: 'Goblin A', size: 1 });

  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Goblin A' })).toHaveCount(1);
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Goblin B' })).toHaveCount(1);
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Goblin C' })).toHaveCount(1);
});

test('2x2 tokens center on a four-tile intersection while reporting the top-left occupied cell', async ({ page }) => {
  await addToken(page, { name: 'Ogre', size: 2 });
  await dragTokenToTopLeftCell(page, { size: 2, cellX: 4, cellY: 3 });
  await expectTokenCell(page, 'Ogre', 4, 3);
});

test('3x3 tokens center on the middle of the center tile', async ({ page }) => {
  await addToken(page, { name: 'Dragon', size: 3 });
  await dragTokenToTopLeftCell(page, { size: 3, cellX: 2, cellY: 4 });
  await expectTokenCell(page, 'Dragon', 2, 4);
});

test('editing the current turn token size re-snaps it while preserving its occupied origin cell', async ({ page }) => {
  await addToken(page, { name: 'Knight', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 5, cellY: 5 });
  await expectTokenCell(page, 'Knight', 5, 5);

  await openDetails(page, '#turnSection');
  await page.locator('#selSize').selectOption('3');
  await page.locator('#selColor').selectOption('#7dffb2');

  await expect(page.locator('#selSize')).toHaveValue('3');
  await expect(page.locator('#selColor')).toHaveValue('#7dffb2');
  await expectTokenCell(page, 'Knight', 5, 5);
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Knight' })).toContainText('3×3');
});

test('manual AI JSON application draws a move path, shows a short summary, and writes detailed reasoning to the log', async ({ page }) => {
  await addToken(page, { name: 'Ogre', size: 2 });

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Ogre advances to pressure the back line, then dashes to stay threatening while looming over the battlefield and forcing Aria to give ground under the weight of an imminent crushing blow.',
    moves: [{
      token: 'Ogre',
      to: [6, 5],
      path: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 5]],
      rationale: 'Advance along the diagonal to close distance while keeping a lane into the center.'
    }],
    actions: [{
      token: 'Ogre',
      type: 'dash',
      target: null,
      details: 'Rush forward.',
      rationale: 'Dash keeps the ogre in melee range pressure for the next round.',
      attack_kind: null,
      range_ft: null
    }],
    end_turn: true
  }));
  await page.locator('#applyBtn').click();

  await expect(page.locator('#applyStatus')).toContainText('Applied');
  await expect(page.locator('#decisionSummary')).toContainText('Ogre advances to pressure the back line');
  await expect(page.locator('#decisionSummary')).toHaveAttribute('title', /forcing Aria to give ground/);
  await expectTokenCell(page, 'Ogre', 6, 5);

  const overlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(overlay.summary).toContain('Ogre advances to pressure the back line');
  expect(overlay.paths).toHaveLength(1);
  expect(overlay.paths[0].name).toBe('Ogre');
  expect(overlay.paths[0].cells).toEqual([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    { x: 3, y: 3 },
    { x: 4, y: 4 },
    { x: 5, y: 5 },
    { x: 6, y: 5 }
  ]);

  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Moved Ogre -> (6,5)');
  await expect(page.locator('#logBox')).toContainText('Why: Advance along the diagonal');
  await expect(page.locator('#logBox')).toContainText('Path: (0,0) -> (1,1) -> (2,2) -> (3,3) -> (4,4) -> (5,5) -> (6,5)');
  await expect(page.locator('#logBox')).toContainText('Action: Ogre dash');
  await expect(page.locator('#logBox')).toContainText('Dash keeps the ogre in melee range pressure');
  await expect(page.locator('#logBox')).toContainText('End turn');
});

test('backend auto-apply fills the response box and moves the current token', async ({ page }) => {
  await page.route('http://localhost:3000/api/vtt', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        summary: 'Cleric falls back to a safer square and dodges to anchor the line.',
        moves: [{
          token: 'Cleric',
          to: [7, 6],
          rationale: 'Reposition to the safer back corner while preserving line support.'
        }],
        actions: [{
          token: 'Cleric',
          type: 'dodge',
          target: null,
          details: 'Hold position.',
          rationale: 'Dodge increases survivability once the cleric reaches the fallback square.',
          attack_kind: null,
          range_ft: null
        }],
        end_turn: true,
        _timing: { total_ms: 12, openai_ms: 9, prep_ms: 1, parse_ms: 1, model: 'gpt-4.1-mini' }
      })
    });
  });

  await addToken(page, { name: 'Cleric', size: 1 });
  await openDetails(page, '#aiDrawer');
  await page.locator('#autoApplyAI').check();
  await page.getByRole('button', { name: 'Run AI' }).click();

  await expect(page.locator('#sendStatus')).toContainText('AI response');
  await expect(page.locator('#decisionSummary')).toContainText('Cleric falls back to a safer square');
  await openDrawerTab(page, 'apply');
  await expect(page.locator('#applyJson')).toHaveValue(/"Cleric"/);
  await expectTokenCell(page, 'Cleric', 7, 6);
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Moved Cleric -> (7,6)');
});

test('movement rules reject wrong-turn, out-of-range, and overlapping AI moves', async ({ page }) => {
  await addToken(page, { name: 'Guard', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 6, cellY: 1 });

  await addToken(page, { name: 'Ogre', size: 2 });
  await setCurrentTurnToken(page, 'Guard');
  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Ogre', to: [4, 4] }],
    actions: [],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('not the current turn token');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Guard', to: [15, 1] }],
    actions: [],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('speed 30 ft allows 6 cells, not 9');
  await expectTokenCell(page, 'Guard', 6, 1);

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Guard', to: [0, 0] }],
    actions: [],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('space is occupied by Ogre');
  await expectTokenCell(page, 'Guard', 6, 1);
});

test('melee attacks are rejected when the target is beyond reach', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 1 });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 3, cellY: 1 });
  await setCurrentTurnToken(page, 'Goblin A');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Goblin lunges too early.',
    moves: [],
    actions: [{
      token: 'Goblin A',
      type: 'attack',
      target: 'Hero',
      details: 'Scimitar slash.',
      rationale: 'Strike immediately before the hero closes.',
      attack_kind: 'melee',
      range_ft: 5
    }],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();

  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Action ignored: Goblin A cannot make a melee attack on Hero from 10 ft away');
});

test('movement path allows friendlies but blocks opponents', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 1 });
  await addToken(page, { name: 'Guide', size: 1, type: 'NPC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 3, cellY: 1 });
  await setCurrentTurnToken(page, 'Hero');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Hero', to: [5, 1] }],
    actions: [],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();
  await expectTokenCell(page, 'Hero', 5, 1);

  await clearTokens(page);

  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 1 });
  await addToken(page, { name: 'Ogre', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 3, cellY: 1 });
  await setCurrentTurnToken(page, 'Hero');

  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Hero', to: [5, 1] }],
    actions: [],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('cannot pass through Ogre');
  await expectTokenCell(page, 'Hero', 1, 1);
});

test('map controls update the map pill and drag mode label', async ({ page }) => {
  await openDetails(page, '#mapSection');
  await page.locator('#mapScale').fill('1.25');
  await page.locator('#mapRotDeg').fill('1.5');
  await page.locator('#mapOpacity').fill('0.6');
  await page.locator('#nudgeCells').fill('1');

  await page.getByRole('button', { name: 'Drag: Tokens' }).click();
  await expect(page.getByRole('button', { name: 'Drag: Map' })).toBeVisible();

  await page.locator('#nudgeRight').click();
  await page.locator('#nudgeDown').click();

  await expect(page.locator('#mapPill')).toContainText('off(64,64)');
  await expect(page.locator('#mapPill')).toContainText('scale 1.25');
  await expect(page.locator('#mapPill')).toContainText('rot 1.50°');
});
