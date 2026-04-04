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

function tokenRow(page, name) {
  return page.locator('#tokenList .tokRow').filter({ hasText: name });
}

async function dragTokenToTopLeftCell(page, { size, cellX, cellY }) {
  const canvas = page.locator('#stage');
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

async function dragNamedTokenToTopLeftCell(page, { name, cellX, cellY }) {
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const points = await page.evaluate(({ name, cellX, cellY }) => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.name === name);
    if (!token) return null;
    const start = window.__VTT_DEBUG__.getTokenInteractionPoint(token.id);
    const gridSize = snapshot.state.gridSize || 64;
    const endWorldX = gridSize * (cellX + (token.sizeCells / 2));
    const endWorldY = gridSize * (cellY + (token.sizeCells / 2));
    const { zoom, panX, panY } = snapshot.state.view;
    return {
      startX: start?.x,
      startY: start?.y,
      endX: (endWorldX * zoom) + panX,
      endY: (endWorldY * zoom) + panY
    };
  }, { name, cellX, cellY });
  if (!points) throw new Error(`Missing token: ${name}`);

  await page.mouse.move(box.x + points.startX, box.y + points.startY);
  await page.mouse.down();
  await page.mouse.move(box.x + points.endX, box.y + points.endY, { steps: 12 });
  await page.mouse.up();
}

async function panStageWithSpace(page, { dx = 96, dy = 48 } = {}) {
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const startX = box.x + box.width - 120;
  const startY = box.y + box.height - 120;

  await page.keyboard.down('Space');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Space');
}

async function expectTokenCell(page, name, x, y) {
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: name })).toContainText(`(${x},${y})`);
}

async function setCurrentTurnToken(page, name) {
  await openDetails(page, '#turnSection');
  const option = page.locator('#turnToken option').filter({ hasText: name }).first();
  await page.locator('#turnToken').selectOption(await option.getAttribute('value'));
}

async function setAiControls(page, value) {
  await openDetails(page, '#turnSection');
  await page.locator('#aiControls').selectOption(value);
}

async function uploadTestMap(page, { width = 256, height = 256 } = {}) {
  await openDetails(page, '#mapSection');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#1b263b" />
      <path d="M 0 0 L ${width} ${height} M ${width} 0 L 0 ${height}" stroke="#5aa9ff" stroke-width="2" opacity="0.45" />
    </svg>
  `;
  await page.locator('#mapFile').setInputFiles({
    name: 'test-map.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg)
  });
}

async function setHiddenInputValue(page, selector, value) {
  await page.evaluate(({ selector, value }) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, value });
}

async function clickHiddenElement(page, selector) {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    element.click();
  }, selector);
}

async function selectHiddenOptionByLabel(page, selector, label) {
  await page.evaluate(({ selector, label }) => {
    const select = document.querySelector(selector);
    if (!select) throw new Error(`Missing element: ${selector}`);
    const option = Array.from(select.options).find((entry) => entry.label === label || entry.textContent === label);
    if (!option) throw new Error(`Missing option: ${label}`);
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, { selector, label });
}

async function clickStageWorld(page, worldX, worldY) {
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  const { zoom, panX, panY } = snapshot.state.view;
  const clientX = box.x + (worldX * zoom) + panX;
  const clientY = box.y + (worldY * zoom) + panY;
  await page.mouse.click(clientX, clientY);
}

async function rightClickTokenOnStage(page, name) {
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');
  const point = await page.evaluate((name) => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.name === name);
    return token ? window.__VTT_DEBUG__.getTokenInteractionPoint(token.id) : null;
  }, name);
  if (!point) throw new Error(`Missing token: ${name}`);
  const clientX = box.x + point.x;
  const clientY = box.y + point.y;
  await page.mouse.click(clientX, clientY, { button: 'right' });
}

async function clickTokenOnStage(page, name, modifiers = []) {
  const point = await page.evaluate((name) => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.name === name);
    return token ? window.__VTT_DEBUG__.getTokenInteractionPoint(token.id) : null;
  }, name);
  if (!point) throw new Error(`Missing token: ${name}`);
  const keys = Array.isArray(modifiers) ? modifiers : [modifiers];
  for (const key of keys) await page.keyboard.down(key);
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');
  await page.mouse.click(box.x + point.x, box.y + point.y);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.removeItem('drowvtt.saveSlots.v1'));
  await page.addInitScript(() => window.localStorage.removeItem('drowvtt.autosaveHistory.v1'));
  await page.addInitScript(() => window.localStorage.removeItem('drowvtt.autosaveEnabled.v1'));
  await page.goto('/');
  await expect(page).toHaveTitle(/Web VTT Prototype/);
  await clearTokens(page);
});

test('loads the VTT UI', async ({ page }) => {
  await expect(page.locator('#gridSize')).toHaveValue('64');
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#apiUrl')).toHaveValue(/http:\/\/localhost:3000\/api\/vtt/);
  await expect(page.locator('#stage')).toBeVisible();
  await openDetails(page, '#saveSection');
  await expect(page.locator('.legacySaveSlotsUi')).toHaveCount(3);
  await expect(page.locator('.legacySaveSlotsUi').first()).toBeHidden();
  await expect(page.locator('#exportBoardBtn')).toContainText('Download Save');
  await expect(page.locator('#importBoardBtn')).toContainText('Open Save');
  await expect(page.locator('#restoreAutosaveBtn')).toContainText('Recover');
  await expect(page.locator('#clearAutosavesBtn')).toContainText('Clear');
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

test('default VTT positioning keeps the sidebar left and the drawer top-right', async ({ page }) => {
  const stage = await page.locator('.stageWrap').boundingBox();
  const sidebar = await page.locator('.sidebar').boundingBox();
  const drawer = await page.locator('#aiDrawer').boundingBox();
  if (!stage || !sidebar || !drawer) throw new Error('Layout bounds unavailable');

  expect(sidebar.x).toBeLessThan(stage.x);
  expect(sidebar.y).toBeLessThan(stage.y + 20);
  expect(drawer.y).toBeLessThan(stage.y + 140);
  expect(drawer.x).toBeGreaterThan(stage.x + (stage.width / 2));
});

test('shared shell styling keeps the canvas, token rows, and drawer interactive by default', async ({ page }) => {
  await addToken(page, { name: 'Styling Goblin', size: 1, type: 'Monster' });

  const shellStyles = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar');
    const canvas = document.querySelector('#stage');
    const tokenRow = document.querySelector('.tokRow');
    const drawerSummary = document.querySelector('#aiDrawer summary');
    if (!topbar || !canvas || !tokenRow || !drawerSummary) return null;
    const topbarStyle = window.getComputedStyle(topbar);
    const canvasStyle = window.getComputedStyle(canvas);
    const rowStyle = window.getComputedStyle(tokenRow);
    const drawerSummaryStyle = window.getComputedStyle(drawerSummary);
    return {
      topbarHidden: topbar.hasAttribute('hidden'),
      canvasCursor: canvasStyle.cursor,
      canvasBackgroundColor: canvasStyle.backgroundColor,
      tokenRowDisplay: rowStyle.display,
      drawerSummaryCursor: drawerSummaryStyle.cursor
    };
  });

  if (!shellStyles) throw new Error('Shared shell styles unavailable');
  expect(shellStyles.topbarHidden).toBe(true);
  expect(shellStyles.canvasCursor).toBe('grab');
  expect(shellStyles.canvasBackgroundColor).toBe('rgb(8, 16, 34)');
  expect(shellStyles.tokenRowDisplay).toBe('grid');
  expect(shellStyles.drawerSummaryCursor).toBe('grab');
});

test('shared shell typography keeps the default OSS VTT font scale', async ({ page }) => {
  await addToken(page, { name: 'Typography Goblin', size: 1, type: 'Monster' });

  const typography = await page.evaluate(() => {
    const body = document.body;
    const heading = document.querySelector('.panelSection summary h2');
    const tokenMeta = document.querySelector('.tokRow .meta');
    const drawerSummary = document.querySelector('#aiDrawer summary');
    if (!body || !heading || !tokenMeta || !drawerSummary) return null;
    const bodyStyle = window.getComputedStyle(body);
    const headingStyle = window.getComputedStyle(heading);
    const tokenMetaStyle = window.getComputedStyle(tokenMeta);
    const drawerSummaryStyle = window.getComputedStyle(drawerSummary);
    return {
      bodyFontFamily: bodyStyle.fontFamily,
      bodyFontSize: bodyStyle.fontSize,
      headingFontSize: headingStyle.fontSize,
      tokenMetaFontSize: tokenMetaStyle.fontSize,
      drawerSummaryFontSize: drawerSummaryStyle.fontSize
    };
  });

  if (!typography) throw new Error('Typography styles unavailable');
  expect(typography.bodyFontFamily.toLowerCase()).not.toContain('georgia');
  expect(typography.bodyFontSize).toBe('16px');
  expect(typography.headingFontSize).toBe('14px');
  expect(typography.tokenMetaFontSize).toBe('11px');
  expect(typography.drawerSummaryFontSize).toBe('12px');
});

test('tokens, turn, and save panels use the expected OSS control typography', async ({ page }) => {
  await addToken(page, { name: 'Style Goblin', size: 1, type: 'Monster' });
  await openDetails(page, '#turnSection');
  await openDetails(page, '#saveSection');

  const panelTypography = await page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        borderRadius: style.borderRadius,
        color: style.color,
        backgroundColor: style.backgroundColor
      };
    };

    return {
      tokenLabel: pick('#tokensSection label'),
      tokenMeta: pick('.tokRow .meta'),
      tokenRowButton: pick('.tokRow button'),
      turnTab: pick('#turnSection .tabBtn'),
      turnInput: pick('#selAC'),
      turnNote: pick('#turnRuleNote'),
      saveInput: pick('#saveSlotName'),
      saveSelect: pick('#saveSlotSelect'),
      saveButton: pick('#saveSlotBtn')
    };
  });

  if (!panelTypography) throw new Error('Panel typography styles unavailable');
  expect(panelTypography.tokenLabel?.fontSize).toBe('12px');
  expect(panelTypography.tokenLabel?.color).toBe('rgb(159, 177, 209)');
  expect(panelTypography.tokenMeta?.fontSize).toBe('11px');
  expect(panelTypography.tokenMeta?.color).toBe('rgb(159, 177, 209)');
  expect(panelTypography.tokenRowButton?.fontFamily).toBe('Arial');
  expect(panelTypography.tokenRowButton?.fontSize).toBe('12px');
  expect(panelTypography.tokenRowButton?.fontWeight).toBe('600');
  expect(panelTypography.tokenRowButton?.paddingTop).toBe('6px');
  expect(panelTypography.tokenRowButton?.paddingRight).toBe('8px');
  expect(panelTypography.tokenRowButton?.borderRadius).toBe('9px');
  expect(panelTypography.turnTab?.fontFamily).toBe('Arial');
  expect(panelTypography.turnTab?.fontSize).toBe('11px');
  expect(panelTypography.turnTab?.fontWeight).toBe('600');
  expect(panelTypography.turnInput?.fontFamily).toBe('Arial');
  expect(panelTypography.turnInput?.fontSize).toBe('13.3333px');
  expect(panelTypography.turnNote?.fontSize).toBe('11px');
  expect(panelTypography.turnNote?.color).toBe('rgb(159, 177, 209)');
  expect(panelTypography.saveInput?.fontFamily).toBe('Arial');
  expect(panelTypography.saveInput?.fontSize).toBe('13.3333px');
  expect(panelTypography.saveSelect?.fontFamily).toBe('Arial');
  expect(panelTypography.saveSelect?.fontSize).toBe('13.3333px');
  expect(panelTypography.saveButton?.fontFamily).toBe('Arial');
  expect(panelTypography.saveButton?.fontSize).toBe('12px');
  expect(panelTypography.saveButton?.fontWeight).toBe('600');
  expect(panelTypography.saveButton?.paddingTop).toBe('9px');
  expect(panelTypography.saveButton?.paddingRight).toBe('10px');
  expect(panelTypography.saveButton?.borderRadius).toBe('10px');
});

test('map and grid panel uses the expected OSS control typography', async ({ page }) => {
  await openDetails(page, '#mapSection');

  const mapTypography = await page.evaluate(() => {
    const pick = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        borderRadius: style.borderRadius,
        color: style.color,
        backgroundColor: style.backgroundColor
      };
    };

    return {
      heading: pick('#mapSection summary h2'),
      label: pick('#mapSection label'),
      note: pick('#mapSection .sectionNote'),
      fileTrigger: pick('#mapSection .fileTrigger'),
      fileMeta: pick('#mapSection .fileMeta'),
      boardButton: pick('#fitMap'),
      dragButton: pick('#dragModeBtn'),
      calibrationButton: pick('#startCalibrationBtn'),
      checkLabel: pick('#mapSection .checkRow label'),
      checkbox: (() => {
        const el = document.querySelector('#showBoardStatus');
        if (!el) return null;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          transform: style.transform,
          marginTop: style.marginTop,
          marginRight: style.marginRight
        };
      })(),
      gridInput: pick('#calibrationGridSize'),
      offsetInput: pick('#horizontalNudgePx'),
      mapPill: pick('#mapPill')
    };
  });

  if (!mapTypography) throw new Error('Map panel typography styles unavailable');
  expect(mapTypography.heading?.fontSize).toBe('14px');
  expect(mapTypography.label?.fontSize).toBe('12px');
  expect(mapTypography.label?.color).toBe('rgb(159, 177, 209)');
  expect(mapTypography.note?.fontSize).toBe('11px');
  expect(mapTypography.note?.color).toBe('rgb(159, 177, 209)');
  expect(mapTypography.fileTrigger?.fontSize).toBe('12px');
  expect(mapTypography.fileTrigger?.fontWeight).toBe('600');
  expect(mapTypography.fileMeta?.fontSize).toBe('11px');
  expect(mapTypography.fileMeta?.color).toBe('rgb(159, 177, 209)');
  expect(mapTypography.boardButton?.fontFamily).toBe('Arial');
  expect(mapTypography.boardButton?.fontSize).toBe('12px');
  expect(mapTypography.boardButton?.fontWeight).toBe('600');
  expect(mapTypography.boardButton?.paddingTop).toBe('9px');
  expect(mapTypography.boardButton?.paddingRight).toBe('10px');
  expect(mapTypography.boardButton?.borderRadius).toBe('10px');
  expect(mapTypography.dragButton?.fontFamily).toBe('Arial');
  expect(mapTypography.dragButton?.fontSize).toBe('12px');
  expect(mapTypography.calibrationButton?.fontFamily).toBe('Arial');
  expect(mapTypography.calibrationButton?.fontSize).toBe('12px');
  expect(mapTypography.checkLabel?.fontSize).toBe('12px');
  expect(mapTypography.checkLabel?.color).toBe('rgb(159, 177, 209)');
  expect(mapTypography.checkbox?.width).toBeGreaterThan(14);
  expect(mapTypography.checkbox?.width).toBeLessThan(15);
  expect(mapTypography.checkbox?.height).toBeGreaterThan(14);
  expect(mapTypography.checkbox?.height).toBeLessThan(15);
  expect(mapTypography.checkbox?.transform).toContain('matrix(1.1');
  expect(mapTypography.gridInput?.fontFamily).toBe('Arial');
  expect(mapTypography.gridInput?.fontSize).toBe('13.3333px');
  expect(mapTypography.offsetInput?.fontFamily).toBe('Arial');
  expect(mapTypography.offsetInput?.fontSize).toBe('13.3333px');
  expect(mapTypography.mapPill?.fontSize).toBe('12px');
});

test('space + left drag pans the stage', async ({ page }) => {
  await expect(page.locator('#viewPill')).toContainText('Pan: (0,0)');
  await panStageWithSpace(page, { dx: 120, dy: 60 });
  await expect(page.locator('#viewPill')).not.toContainText('Pan: (0,0)');
});

test('starter board seeds Aria and Goblin A by default', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#tokenList')).toContainText('Aria');
  await expect(page.locator('#tokenList')).toContainText('Goblin A');
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(2);
});

test('starter board uses center snap mode and centered world anchors', async ({ page }) => {
  await addToken(page, { name: 'Aria', size: 1, type: 'PC' });
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Aria', cellX: 1, cellY: 1 });
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin A', cellX: 0, cellY: 0 });

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  const aria = snapshot.state.tokens.find((token) => token.name === 'Aria');
  const goblin = snapshot.state.tokens.find((token) => token.name === 'Goblin A');

  expect(snapshot.state.snapMode).toBe('center');
  expect(snapshot.state.gridSize).toBe(64);
  expect(aria).toMatchObject({ x: 96, y: 96 });
  expect(goblin).toMatchObject({ x: 32, y: 32 });
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
  await page.locator('#aiStrategy').selectOption('single_tactical');

  await openDrawerTab(page, 'packet');
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#apiUrl')).toHaveValue('http://localhost:3000/api/custom');
  await expect(page.locator('#aiStrategy')).toHaveValue('single_tactical');
  await expect(page.locator('#aiStrategyHint')).toContainText('gpt-5');
  await expect(page.locator('#aiStrategyHint')).toContainText('full');
});

test('AI drawer can be dragged around the stage on desktop layouts', async ({ page }) => {
  const summary = page.locator('#aiDrawer summary');
  const before = await page.locator('#aiDrawer').boundingBox();
  const grip = await summary.boundingBox();
  if (!before || !grip) throw new Error('Drawer bounds unavailable');

  await page.mouse.move(grip.x + (grip.width / 2), grip.y + (grip.height / 2));
  await page.mouse.down();
  await page.mouse.move(grip.x + (grip.width / 2) - 120, grip.y + (grip.height / 2) + 60, { steps: 12 });
  await page.mouse.up();

  const after = await page.locator('#aiDrawer').boundingBox();
  if (!after) throw new Error('Drawer bounds unavailable after drag');
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
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

test('1x1 tokens render at the center of their occupied tile', async ({ page }) => {
  await addToken(page, { name: 'Centered Scout', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 5, cellY: 2 });

  const renderPoint = await page.evaluate(() => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.name === 'Centered Scout');
    return token ? window.__VTT_DEBUG__.getTokenRenderPoint(token.id) : null;
  });

  expect(renderPoint).not.toBeNull();
  expect(renderPoint.x).toBe(64 * 5.5);
  expect(renderPoint.y).toBe(64 * 2.5);
});

test('1x1 token interaction point stays aligned with the rendered token center', async ({ page }) => {
  await addToken(page, { name: 'Aligned Scout', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 4, cellY: 3 });

  const points = await page.evaluate(() => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.name === 'Aligned Scout');
    if (!token) return null;
    return {
      interaction: window.__VTT_DEBUG__.getTokenInteractionPoint(token.id),
      render: window.__VTT_DEBUG__.getTokenRenderPoint(token.id)
    };
  });

  expect(points).not.toBeNull();
  expect(points.interaction.x).toBe(points.render.x);
  expect(points.interaction.y).toBe(points.render.y);
});

test('1x1 token drag threshold advances on the expected snap step', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin A', cellX: 0, cellY: 0 });

  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const point = await page.evaluate(() => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.name === 'Goblin A');
    return token ? window.__VTT_DEBUG__.getTokenInteractionPoint(token.id) : null;
  });
  if (!point) throw new Error('Token interaction point unavailable');

  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x + 24, box.y + point.y + 12, { steps: 6 });
  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
    const token = snapshot.state.tokens.find((entry) => entry.name === 'Goblin A');
    return token ? `${token.x},${token.y}` : null;
  }).toBe('32,32');

  await page.mouse.move(box.x + point.x + 36, box.y + point.y + 18, { steps: 3 });
  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
    const token = snapshot.state.tokens.find((entry) => entry.name === 'Goblin A');
    return token ? `${token.x},${token.y}` : null;
  }).toBe('96,32');
  await page.mouse.up();
});

test('left-click dragging a non-current token moves it in one gesture', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 3 });

  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await setCurrentTurnToken(page, 'Goblin A');
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin A', cellX: 3, cellY: 1 });
  await expectTokenCell(page, 'Goblin A', 3, 1);

  await setAiControls(page, 'Both');
  await setCurrentTurnToken(page, 'Hero');
  await expect(page.locator('#turnToken option:checked')).toContainText('Hero');

  const row = page.locator('#tokenList .tokRow').filter({ hasText: 'Goblin A' });
  await expect(row).toContainText('(3,1)');

  const canvas = page.locator('#stage');
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
  const sessionEvents = await page.evaluate(() => window.__VTT_DEBUG__.getSessionEvents());
  expect(sessionEvents.some((event) => event.type === 'token.created')).toBe(true);
  expect(sessionEvents.some((event) => event.type === 'token.moved')).toBe(true);
  expect(sessionEvents.some((event) => event.type === 'turn.changed')).toBe(true);
});

test('manual dragging can place a token into an occupied space without AI movement constraints', async ({ page }) => {
  await addToken(page, { name: 'Guard', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 6, cellY: 1 });

  await addToken(page, { name: 'Ogre', size: 2 });
  await dragNamedTokenToTopLeftCell(page, { name: 'Ogre', cellX: 0, cellY: 0 });
  await setCurrentTurnToken(page, 'Guard');

  await dragNamedTokenToTopLeftCell(page, { name: 'Guard', cellX: 0, cellY: 0 });

  await expectTokenCell(page, 'Guard', 0, 0);
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Moved Guard -> (0,0)');
});

test('manual dragging can move farther than the token speed would normally allow', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin A', cellX: 8, cellY: 0 });

  await expectTokenCell(page, 'Goblin A', 8, 0);
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Moved Goblin A -> (8,0)');
});

test('stage right-click on a real token center opens the token context menu', async ({ page }) => {
  await addToken(page, { name: 'Ghast Captain', size: 1, type: 'Monster' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Ghast Captain', cellX: 6, cellY: 3 });

  await rightClickTokenOnStage(page, 'Ghast Captain');

  await expect(page.locator('#tokenContextMenu')).toBeVisible();
  await expect(page.locator('#menuAddArt')).toContainText('Add art');
  await expect(page.locator('#menuClearArt')).toBeDisabled();
});

test('ctrl-clicking a monster after selecting a PC drops the PC instead of forming a mixed group', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });

  await tokenRow(page, 'Hero').click();
  await expect(tokenRow(page, 'Hero')).toHaveClass(/selected/);

  await tokenRow(page, 'Goblin A').click({ modifiers: ['Control'] });

  await expect(tokenRow(page, 'Hero')).not.toHaveClass(/selected/);
  await expect(tokenRow(page, 'Hero')).not.toContainText('Grouped');
  await expect(tokenRow(page, 'Goblin A')).toHaveClass(/selected/);
  await expect(page.locator('#aiStrategy')).toHaveValue('single_tactical');
});

test('multi-selecting monsters auto-switches tactics director to group tactical', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await addToken(page, { name: 'Goblin B', size: 1, type: 'Monster' });

  await clickTokenOnStage(page, 'Goblin A');
  await clickTokenOnStage(page, 'Goblin B', ['Control']);

  await expect(page.locator('#aiStrategy')).toHaveValue('group_tactical');
  await expect(tokenRow(page, 'Goblin A')).toContainText('Grouped');
  await expect(tokenRow(page, 'Goblin B')).toContainText('Grouped');
  await expect(page.locator('#tokenSelectionNote')).toContainText('2 grouped AI-controlled tokens');
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

test('token art can be uploaded, cropped, and saved from the token list', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });

  const row = page.locator('#tokenList .tokRow').filter({ hasText: 'Hero' });
  await row.getByRole('button', { name: 'Art' }).click();
  await expect(page.locator('#tokenArtModal')).toBeVisible();

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f8ef1" />
          <stop offset="100%" stop-color="#ffd166" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="28" fill="url(#g)" />
      <circle cx="128" cy="104" r="48" fill="#0b1020" />
      <rect x="70" y="156" width="116" height="56" rx="24" fill="#0b1020" />
    </svg>
  `;

  await page.locator('#tokenArtFile').setInputFiles({
    name: 'hero-token.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svg)
  });

  await expect(page.locator('#tokenArtMeta')).toContainText('hero-token.svg');
  await page.locator('#tokenArtZoom').evaluate((el) => {
    el.value = '1.4';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#tokenArtPanX').evaluate((el) => {
    el.value = '0.25';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.getByRole('button', { name: 'Save art' }).click();
  await expect(page.locator('#tokenArtModal')).toBeHidden();
  await expect(row).toContainText('Art');

  const hero = await page.evaluate(() =>
    window.__VTT_DEBUG__.getTokens().find((token) => token.name === 'Hero')
  );
  expect(hero.art).toBeTruthy();
  expect(hero.art.fileName).toBe('hero-token.svg');
  expect(hero.art.scale).toBeCloseTo(1.4, 5);
  expect(hero.art.panX).toBeCloseTo(0.25, 5);
});

test('named save slots restore a saved board and can be managed from the toolbar', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 4, cellY: 2 });

  await openDetails(page, '#turnSection');
  await page.locator('#roundNum').fill('3');
  await page.locator('#aiControls').selectOption('PCs');
  await openDetails(page, '#saveSection');
  await setHiddenInputValue(page, '#saveSlotName', 'Round 3 Start');

  await clickHiddenElement(page, '#saveSlotBtn');
  await expect(page.locator('#saveStateStatus')).toContainText('Round 3 Start');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotSelect')?.value || '')
  )).toMatch(/.+/);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);
  await page.locator('#roundNum').fill('1');
  await page.locator('#aiControls').selectOption('Monsters');
  await setHiddenInputValue(page, '#saveSlotName', 'Empty Board');
  await clickHiddenElement(page, '#saveSlotBtn');

  await selectHiddenOptionByLabel(page, '#saveSlotSelect', 'Round 3 Start');
  await clickHiddenElement(page, '#loadSlotBtn');

  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot().state.tokens.map((token) => token.name))
  )).toContain('Hero');
  await expect(page.locator('#saveStateStatus')).toContainText('Round 3 Start');
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Hero' })).toHaveCount(1);
  await expectTokenCell(page, 'Hero', 4, 2);
  await expect(page.locator('#roundNum')).toHaveValue('3');
  await expect(page.locator('#aiControls')).toHaveValue('PCs');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotName')?.value || '')
  )).toBe('Round 3 Start');

  await selectHiddenOptionByLabel(page, '#saveSlotSelect', 'Empty Board');
  await clickHiddenElement(page, '#deleteSlotBtn');

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  const slots = await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots());
  expect(snapshot.version).toBe(1);
  expect(snapshot.state.tokens).toHaveLength(1);
  expect(snapshot.state.tokens[0].name).toBe('Hero');
  expect(slots.map((slot) => slot.name)).toEqual(['Round 3 Start']);
});

test('saving with a new slot name creates a new slot instead of overwriting another selected slot', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await openDetails(page, '#saveSection');

  await setHiddenInputValue(page, '#saveSlotName', 'Round 1');
  await clickHiddenElement(page, '#saveSlotBtn');

  await openDetails(page, '#turnSection');
  await page.locator('#roundNum').fill('2');
  await openDetails(page, '#saveSection');
  await setHiddenInputValue(page, '#saveSlotName', 'Round 2');
  await clickHiddenElement(page, '#saveSlotBtn');

  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots().map((slot) => slot.name))
  )).toEqual(['Round 2', 'Round 1']);

  await selectHiddenOptionByLabel(page, '#saveSlotSelect', 'Round 1');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotName')?.value || '')
  )).toBe('Round 1');

  await openDetails(page, '#turnSection');
  await page.locator('#roundNum').fill('3');
  await openDetails(page, '#saveSection');
  await setHiddenInputValue(page, '#saveSlotName', 'Round 3');
  await clickHiddenElement(page, '#saveSlotBtn');

  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots().map((slot) => slot.name))
  )).toEqual(['Round 3', 'Round 2', 'Round 1']);
});

test('saving with another slot name reuses that named slot instead of failing', async ({ page }) => {
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await openDetails(page, '#saveSection');

  await setHiddenInputValue(page, '#saveSlotName', 'Round 1');
  await clickHiddenElement(page, '#saveSlotBtn');

  await setHiddenInputValue(page, '#saveSlotName', 'Round 2');
  await clickHiddenElement(page, '#saveSlotBtn');

  await selectHiddenOptionByLabel(page, '#saveSlotSelect', 'Round 1');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotName')?.value || '')
  )).toBe('Round 1');

  await setHiddenInputValue(page, '#saveSlotName', 'Round 2');
  await clickHiddenElement(page, '#saveSlotBtn');

  await expect(page.locator('#saveStateStatus')).toContainText('Round 2');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotSelect')?.value || '')
  )).toMatch(/.+/);
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotName')?.value || '')
  )).toBe('Round 2');

  const slots = await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots());
  expect(slots.map((slot) => slot.name)).toEqual(['Round 2', 'Round 1']);
});

test('map-backed named saves can be created repeatedly and restored', async ({ page }) => {
  await uploadTestMap(page, { width: 1024, height: 1024 });
  await addToken(page, { name: 'Ranger', size: 1, type: 'PC' });
  await openDetails(page, '#saveSection');
  await openDetails(page, '#turnSection');

  for (const [name, round] of [['Quick Save', '1'], ['Quick Save 3', '3'], ['Quick Save 10', '10']]) {
    await page.locator('#roundNum').fill(round);
    await openDetails(page, '#saveSection');
    await setHiddenInputValue(page, '#saveSlotName', name);
    await clickHiddenElement(page, '#saveSlotBtn');
    await expect(page.locator('#saveStateStatus')).toContainText(name);
  }

  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots().map((slot) => slot.name))
  )).toEqual(['Quick Save 10', 'Quick Save 3', 'Quick Save']);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);

  await selectHiddenOptionByLabel(page, '#saveSlotSelect', 'Quick Save 3');
  await clickHiddenElement(page, '#loadSlotBtn');

  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Ranger' })).toHaveCount(1);
  await expect(page.locator('#roundNum')).toHaveValue('3');
  await expect(page.locator('#saveStateStatus')).toContainText('Quick Save 3');
});

test('board snapshots can be exported and imported as json files', async ({ page }) => {
  await addToken(page, { name: 'Mage', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 6, cellY: 4 });
  await openDetails(page, '#turnSection');
  await page.locator('#roundNum').fill('5');
  await openDetails(page, '#saveSection');

  const exported = await page.evaluate(() => JSON.stringify(window.__VTT_DEBUG__.getBoardSnapshot()));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Save' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^drowvtt-board-save-\d{8}-\d{4}\.json$/);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.locator('#roundNum').fill('1');
  await page.locator('#importBoardFile').setInputFiles({
    name: 'restored-board.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported)
  });

  await expectTokenCell(page, 'Mage', 6, 4);
  await expect(page.locator('#roundNum')).toHaveValue('5');
  await expect(page.locator('#saveStateStatus')).toContainText('Imported JSON');
});

test('autosave history can restore a recent board snapshot', async ({ page }) => {
  await openDetails(page, '#saveSection');
  await expect(page.locator('#autosaveEnabled')).toBeChecked();

  await addToken(page, { name: 'Scout', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 2, cellY: 5 });

  await page.waitForFunction(() => window.__VTT_DEBUG__.getAutosaves().length > 0);
  await expect(page.locator('#autosaveSelect option')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);

  await page.getByRole('button', { name: 'Recover' }).click();

  await expectTokenCell(page, 'Scout', 2, 5);
  await expect(page.locator('#saveStateStatus')).toContainText('Restored autosave');
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

test('group tactical application moves multiple grouped monsters and keeps a trace for each', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 1 });
  await addToken(page, { name: 'Goblin B', size: 1, type: 'Monster' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin B', cellX: 3, cellY: 1 });

  await clickTokenOnStage(page, 'Goblin A');
  await clickTokenOnStage(page, 'Goblin B', ['Control']);
  await expect(page.locator('#aiStrategy')).toHaveValue('group_tactical');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'The goblins advance together.',
    moves: [
      { token: 'Goblin A', to: [2, 2], rationale: 'Close distance from the left flank.' },
      { token: 'Goblin B', to: [4, 2], rationale: 'Mirror the push from the right flank.' }
    ],
    actions: [],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();

  await expectTokenCell(page, 'Goblin A', 2, 2);
  await expectTokenCell(page, 'Goblin B', 4, 2);
  const overlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(overlay.paths).toHaveLength(2);
  expect(overlay.paths.map((entry) => entry.name).sort()).toEqual(['Goblin A', 'Goblin B']);
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
  const authContext = await page.evaluate(() => window.__VTT_DEBUG__.getAuthContext());
  expect(authContext.isAuthenticated).toBe(true);
  expect(authContext.userId).toBe('local-user');
  expect(authContext.accountId).toBe('local-account');
  const usageEvents = await page.evaluate(() => window.__VTT_DEBUG__.getUsageEvents());
  expect(usageEvents).toHaveLength(1);
  expect(usageEvents[0].status).toBe('succeeded');
  expect(usageEvents[0].model).toBe('gpt-4.1-mini');
  expect(usageEvents[0].userId).toBe('local-user');
  expect(usageEvents[0].accountId).toBe('local-account');
  expect(usageEvents[0].requestId).toBeTruthy();
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Moved Cleric -> (7,6)');
});

test('backend failures are recorded in local usage tracking', async ({ page }) => {
  await page.route('http://localhost:3000/api/vtt', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Backend failed',
        details: 'Synthetic failure for test'
      })
    });
  });

  await addToken(page, { name: 'Cleric', size: 1 });
  await openDetails(page, '#aiDrawer');
  await page.getByRole('button', { name: 'Run AI' }).click();

  await expect(page.locator('#sendStatus')).toContainText('Send failed');
  const usageEvents = await page.evaluate(() => window.__VTT_DEBUG__.getUsageEvents());
  expect(usageEvents).toHaveLength(1);
  expect(usageEvents[0].status).toBe('failed');
  expect(usageEvents[0].requestId).toBeTruthy();
  expect(usageEvents[0].error).toContain('HTTP 500');
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
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 3, cellY: 1 });
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await setCurrentTurnToken(page, 'Goblin A');
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin A', cellX: 1, cellY: 1 });
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
  await dragNamedTokenToTopLeftCell(page, { name: 'Guide', cellX: 3, cellY: 1 });
  await setAiControls(page, 'Both');
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
  await dragNamedTokenToTopLeftCell(page, { name: 'Ogre', cellX: 3, cellY: 1 });
  await setAiControls(page, 'Both');
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
  await page.locator('#showBoardStatus').check();
  await page.locator('#calibrationGridSize').fill('72');
  await page.locator('#horizontalNudgePx').fill('48');
  await page.locator('#verticalNudgePx').fill('24');

  await page.getByRole('button', { name: 'Drag: Tokens' }).click();
  await expect(page.getByRole('button', { name: 'Drag: Map' })).toBeVisible();
  await expect(page.locator('#gridPill')).toContainText('72px');
  await expect(page.locator('#mapPill')).toContainText('off(48,24)');
});

test('calibration offset fields directly update map offsets and survive redraw', async ({ page }) => {
  await uploadTestMap(page);
  await openDetails(page, '#mapSection');
  await page.locator('#showBoardStatus').check();

  await page.locator('#horizontalNudgePx').fill('36');
  await page.locator('#verticalNudgePx').fill('-18');
  await expect(page.locator('#mapPill')).toContainText('off(36,-18)');

  await page.getByRole('button', { name: 'Fit map' }).click();
  await expect(page.locator('#horizontalNudgePx')).not.toHaveValue('36');
  await expect(page.locator('#verticalNudgePx')).not.toHaveValue('-18');

  await page.locator('#horizontalNudgePx').fill('12');
  await page.locator('#verticalNudgePx').fill('8');
  await expect(page.locator('#mapPill')).toContainText('off(12,8)');

  await page.getByRole('button', { name: 'Drag: Tokens' }).click();
  await expect(page.getByRole('button', { name: 'Drag: Map' })).toBeVisible();
  await expect(page.locator('#mapPill')).toContainText('off(12,8)');
});

test('manual calibration measures one cell and then shifts the map alignment', async ({ page }) => {
  await uploadTestMap(page);
  await openDetails(page, '#mapSection');

  await expect(page.locator('#gridCalibrationNote')).toContainText('Current grid: 64px');
  await page.getByRole('button', { name: 'Start calibration' }).click();
  await expect(page.locator('#gridCalibrationNote')).toContainText('step 1 of 2');

  await clickStageWorld(page, 20, 20);
  await expect(page.locator('#gridCalibrationNote')).toContainText('adjacent grid line or corner');

  await clickStageWorld(page, 84, 20);
  await expect(page.locator('#gridSize')).toHaveValue('64');
  await expect(page.locator('#calibrationGridSize')).toHaveValue('64');
  await expect(page.locator('#saveStateStatus')).toContainText('Grid size set to 64px');
  await expect(page.locator('#gridCalibrationNote')).toContainText('step 2 of 2');

  await clickStageWorld(page, 20, 20);
  await expect(page.locator('#saveStateStatus')).toContainText('Calibration applied');
  await expect(page.locator('#gridCalibrationNote')).toContainText('Current grid: 64px');
  await expect(page.locator('#horizontalNudgePx')).toHaveValue('-20');
  await expect(page.locator('#verticalNudgePx')).toHaveValue('-20');
  await expect(page.locator('#mapPill')).toContainText('off(-20,-20)');
  const sessionEvents = await page.evaluate(() => window.__VTT_DEBUG__.getSessionEvents());
  expect(sessionEvents.some((event) => event.type === 'calibration.updated')).toBe(true);
});

test('manual calibration can be cancelled with escape before changing the map', async ({ page }) => {
  await uploadTestMap(page);
  await openDetails(page, '#mapSection');

  await page.getByRole('button', { name: 'Start calibration' }).click();
  await clickStageWorld(page, 20, 20);
  await expect(page.locator('#gridCalibrationNote')).toContainText('adjacent grid line or corner');

  await page.keyboard.press('Escape');

  await expect(page.locator('#gridCalibrationNote')).toContainText('Current grid: 64px');
  await expect(page.locator('#gridSize')).toHaveValue('64');
  await expect(page.locator('#mapPill')).toContainText('off(0,0)');
});
