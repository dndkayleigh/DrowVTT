import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SupervisorScriptedGroupController } from '../../packages/tactical-ai-core/src/index.js';
import { parseVisibleEncounterFixture } from '../../packages/tactical-ai-content/src/index.js';
import {
  LEGACY_BOARD_SNAPSHOT_WITHOUT_TACTICAL,
  LIVE_TACTICAL_METADATA_SNAPSHOT,
  cloneBoardSnapshot
} from './fixtures/live-tactical-metadata-board-snapshots.fixture.mjs';

async function openDetails(page, selector) {
  const sectionMap = {
    '#sessionSection': 'session',
    '#mapSection': 'map',
    '#tokensSection': 'tokens',
    '#turnSection': 'turn',
    '#saveSection': 'session',
    '#aiSection': 'ai',
    '#aiDrawer': 'ai'
  };
  const sectionId = sectionMap[selector];
  if (sectionId) {
    const app = page.locator('.app');
    const isDrawerOpen = await page.locator('#contextDrawer').getAttribute('data-open');
    const activeButton = page.locator(`[data-sidebar-section-target="${sectionId}"][aria-pressed="true"]`);
    const alreadyActive = await activeButton.count();
    if (isDrawerOpen !== 'true' || !alreadyActive) {
      const railButton = page.locator(`[data-sidebar-section-target="${sectionId}"]`);
      await railButton.click();
      await expect(app).toHaveClass(/drawerOpen/);
    }
  }
  const resolvedSelector = selector === '#aiDrawer'
    ? '#aiSection'
    : selector === '#saveSection'
      ? '#sessionSection'
      : selector;
  const details = page.locator(resolvedSelector);
  if ((await details.getAttribute('open')) !== null) return;
  await details.evaluate((el) => { el.open = true; });
}

async function openDrawerTab(page, tab) {
  const app = page.locator('.app');
  const isDrawerOpen = await page.locator('#contextDrawer').getAttribute('data-open');
  const aiButton = page.locator('[data-sidebar-section-target="ai"]');
  const aiActive = await page.locator('[data-sidebar-section-target="ai"][aria-pressed="true"]').count();
  if (isDrawerOpen !== 'true' || !aiActive) {
    await aiButton.click();
    await expect(app).toHaveClass(/drawerOpen/);
  }
  await expect(page.locator('#aiSection')).toBeVisible();
  const panel = page.locator(`[data-tab-panel="${tab}"], [data-drawer-panel="${tab}"], [data-turn-panel="${tab}"]`);
  if (!(await panel.isVisible().catch(() => false))) {
    await page.locator(`[data-drawer-tab="${tab}"]`).click();
  }
}

async function closeDrawer(page) {
  const app = page.locator('.app');
  if ((await page.locator('#contextDrawer').getAttribute('data-open')) === 'true') {
    await page.locator('#contextDrawerClose').click();
    await expect(app).not.toHaveClass(/drawerOpen/);
  }
}

async function enableTouchUi(page) {
  const install = () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get() {
        return 5;
      }
    });
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query === '(pointer: coarse)') {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() { return false; }
        };
      }
      return originalMatchMedia(query);
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

async function clearTokens(page) {
  await openDetails(page, '#tokensSection');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);
  await closeDrawer(page);
}

async function addToken(page, { name, size, type = 'Monster' }) {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill(name);
  await page.locator('#tokType').selectOption(type);
  await page.locator('#tokSize').selectOption(String(size));
  await page.getByRole('button', { name: 'Add token' }).click();
  await closeDrawer(page);
}

function tokenRow(page, name) {
  return page.locator('#tokenList .tokRow').filter({ hasText: name });
}

async function dragTokenToTopLeftCell(page, { size, cellX, cellY }) {
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const points = await page.evaluate(({ cellX, cellY, size }) => {
    const snapshot = window.__VTT_DEBUG__.getBoardSnapshot();
    const token = snapshot.state.tokens.find((entry) => entry.id === snapshot.state.currentTurnTokenId);
    if (!token) return null;
    const start = window.__VTT_DEBUG__.getTokenInteractionPoint(token.id);
    const gridSize = snapshot.state.gridSize || 64;
    const footprint = token.sizeCells || size || 1;
    const endWorldX = gridSize * (cellX + (footprint / 2));
    const endWorldY = gridSize * (cellY + (footprint / 2));
    const { zoom, panX, panY } = snapshot.state.view;
    return {
      startX: start?.x,
      startY: start?.y,
      endX: (endWorldX * zoom) + panX,
      endY: (endWorldY * zoom) + panY
    };
  }, { size, cellX, cellY });
  if (!points) throw new Error('Current-turn token interaction point unavailable');

  await page.mouse.move(box.x + points.startX, box.y + points.startY);
  await page.mouse.down();
  await page.mouse.move(box.x + points.endX, box.y + points.endY, { steps: 12 });
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
  await closeDrawer(page);
}

async function setAiControls(page, value) {
  await openDetails(page, '#turnSection');
  const control = page.locator('#aiControls');
  if (await control.count()) {
    await control.selectOption(value);
  } else {
    await page.evaluate((nextValue) => window.__VTT_DEBUG__.setAiControls(nextValue), value);
  }
  await closeDrawer(page);
}

async function setAiStrategy(page, value, label = value) {
  await page.evaluate(({ value, label }) => {
    const select = document.querySelector('#aiStrategy');
    if (!select) throw new Error('Missing element: #aiStrategy');
    let option = Array.from(select.options).find((entry) => entry.value === value);
    if (!option) {
      option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, { value, label });
}

async function setRound(page, value) {
  await openDetails(page, '#turnSection');
  const control = page.locator('#roundNum');
  if (await control.count()) {
    await control.fill(String(value));
  } else {
    await page.evaluate((nextValue) => window.__VTT_DEBUG__.setRound(nextValue), value);
  }
}

async function expectRound(page, value) {
  const control = page.locator('#roundNum');
  if (await control.count()) {
    await expect(control).toHaveValue(String(value));
    return;
  }
  await expect.poll(async () => page.evaluate(() => String(window.__VTT_DEBUG__.getRound()))).toBe(String(value));
}

async function expectAiControls(page, value) {
  const control = page.locator('#aiControls');
  if (await control.count()) {
    await expect(control).toHaveValue(value);
    return;
  }
  await expect.poll(async () => page.evaluate(() => window.__VTT_DEBUG__.getAiControls())).toBe(value);
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
  await expect(page.locator('.app')).not.toHaveClass(/drawerOpen/);
  await expect(page.locator('#contextDrawer')).toHaveAttribute('data-open', 'false');
  await expect(page.locator('#gridSize')).toHaveValue('64');
  await expect(page.locator('.stageWatermark')).toBeVisible();
  await expect(page.locator('.stageWatermarkWordmark')).toHaveText('DrowVTT');
  await expect(page.locator('#saveSlotName')).toHaveValue(new RegExp(`^New Session - \\d{4}-\\d{2}-\\d{2}$`));
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#apiUrl')).toHaveValue(/http:\/\/localhost:3000\/api\/vtt/);
  await expect(page.locator('#stage')).toBeVisible();
  await openDetails(page, '#saveSection');
  await expect(page.locator('.legacySaveSlotsUi')).toHaveCount(3);
  await expect(page.locator('.legacySaveSlotsUi').first()).toBeHidden();
  await expect(page.locator('#exportBoardBtn')).toContainText('Download Save');
  await expect(page.locator('#exportTacticalFixtureBtn')).toContainText('Export Tactical Fixture');
  await expect(page.locator('#importBoardBtn')).toContainText('Open Save');
  await expect(page.locator('#restoreAutosaveBtn')).toContainText('Recover');
  await expect(page.locator('#clearAutosavesBtn')).toContainText('Clear');
});

test('left rail toggles the contextual drawer and swaps sections', async ({ page }) => {
  const app = page.locator('.app');
  const title = page.locator('#contextDrawerTitle');

  await page.locator('[data-sidebar-section-target="map"]').click();
  await expect(app).toHaveClass(/drawerOpen/);
  await expect(title).toHaveText('Map & Grid');
  await expect(page.locator('#mapSection')).toBeVisible();
  await expect(page.locator('#tokensSection')).toBeHidden();

  await page.locator('[data-sidebar-section-target="tokens"]').click();
  await expect(title).toHaveText('Tokens');
  await expect(page.locator('#tokensSection')).toBeVisible();
  await expect(page.locator('#mapSection')).toBeHidden();

  await page.locator('[data-sidebar-section-target="tokens"]').click();
  await expect(app).not.toHaveClass(/drawerOpen/);
  await expect(page.locator('#contextDrawer')).toHaveAttribute('data-open', 'false');
});

test('rail shows Session Map Tokens Turn and Tactics with no Save button', async ({ page }) => {
  await expect(page.locator('.railButton')).toHaveCount(5);
  await expect(page.locator('.railButtonLabel')).toHaveText(['Session', 'Map', 'Tokens', 'Turn', 'Tactics']);
  await expect(page.locator('[data-sidebar-section-target="save"]')).toHaveCount(0);
});

test('session drawer owns session naming and save recovery controls', async ({ page }) => {
  await openDetails(page, '#sessionSection');
  await expect(page.locator('#contextDrawerTitle')).toHaveText('Session');
  await expect(page.locator('#saveSlotName')).toBeVisible();
  await expect(page.locator('#saveSlotName')).toHaveValue(new RegExp(`^New Session - \\d{4}-\\d{2}-\\d{2}$`));
  await expect(page.locator('#encounterDescription')).toBeVisible();
  await expect(page.locator('#exportBoardBtn')).toBeVisible();
  await expect(page.locator('#exportTacticalFixtureBtn')).toBeVisible();
  await expect(page.locator('#importBoardBtn')).toBeVisible();
  await expect(page.locator('#autosaveSelect')).toBeVisible();
  await expect(page.locator('#restoreAutosaveBtn')).toBeVisible();
  await expect(page.locator('#clearAutosavesBtn')).toBeVisible();
});

test('map drawer owns board tools formerly in session', async ({ page }) => {
  await openDetails(page, '#mapSection');
  await expect(page.locator('#contextDrawerTitle')).toHaveText('Map & Grid');
  await expect(page.locator('#resetView')).toBeVisible();
  await expect(page.locator('#dragModeBtn')).toBeVisible();
  await expect(page.locator('#fitMap')).toBeVisible();
  await expect(page.locator('#showBoardStatus')).toBeVisible();
});

test('AI section defaults to compact controls with autopilot on and no tab expanded', async ({ page }) => {
  await openDetails(page, '#aiSection');
  await expect(page.locator('#contextDrawerTitle')).toHaveText('Tactics Director');
  await expect(page.getByRole('button', { name: 'Run Tactics' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();
  await expect(page.getByText('Autopilot')).toBeVisible();

  for (const tab of ['packet', 'settings', 'apply', 'log']) {
    await expect(page.locator(`[data-drawer-tab="${tab}"]`)).toBeVisible();
    await expect(page.locator(`[data-drawer-panel="${tab}"]`)).toBeHidden();
  }
});

test('default VTT positioning keeps the rail left and overlays the unified drawer over the stage', async ({ page }) => {
  const stage = await page.locator('.stageWrap').boundingBox();
  const rail = await page.locator('.leftRail').boundingBox();
  await page.locator('[data-sidebar-section-target="map"]').click();
  const drawer = await page.locator('#contextDrawer .contextDrawerFrame').boundingBox();
  if (!stage || !rail || !drawer) throw new Error('Layout bounds unavailable');

  expect(rail.x).toBeLessThan(stage.x);
  expect(drawer.x).toBeLessThan(stage.x + 24);
  expect(drawer.y).toBeLessThan(stage.y + 24);
});

test('responsive shell exposes only desktop and mobile rail layouts', async ({ page }) => {
  const snapshotAt = async (width) => {
    await page.setViewportSize({ width, height: 900 });
    return page.evaluate(() => {
      const app = document.querySelector('.app');
      const rail = document.querySelector('.leftRail');
      const stage = document.querySelector('.stageWrap');
      const railStyle = window.getComputedStyle(rail);
      const appStyle = window.getComputedStyle(app);
      const stageStyle = window.getComputedStyle(stage);
      return {
        gridTemplateColumns: appStyle.gridTemplateColumns,
        gridTemplateRows: appStyle.gridTemplateRows,
        railFlexDirection: railStyle.flexDirection,
        railGridColumns: railStyle.gridTemplateColumns,
        stageGridRowStart: stageStyle.gridRowStart
      };
    });
  };

  const desktop = await snapshotAt(1200);
  const medium = await snapshotAt(1000);
  const mobile = await snapshotAt(800);

  expect(desktop.gridTemplateColumns).toContain('72px');
  expect(desktop.railFlexDirection).toBe('column');

  expect(medium.gridTemplateColumns).toContain('72px');
  expect(medium.gridTemplateColumns).not.toContain('340px');
  expect(medium.railFlexDirection).toBe('column');

  expect(mobile.gridTemplateRows).not.toBe('none');
  expect(mobile.railGridColumns.split(' ').filter(Boolean)).toHaveLength(5);
  expect(mobile.stageGridRowStart).toBe('2');
});

test('responsive shell sweep stays in exactly two modes and the mobile rail never wraps', async ({ page }) => {
  const widths = [1400, 1200, 1000, 950, 920, 901, 900, 899, 840, 800, 700, 600, 480, 390, 360];
  const signatures = new Set();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });

    const closed = await page.evaluate(() => {
      const app = document.querySelector('.app');
      const rail = document.querySelector('.leftRail');
      const stage = document.querySelector('.stageWrap');
      const railButtons = Array.from(document.querySelectorAll('.railButton'));
      const appStyle = window.getComputedStyle(app);
      const railStyle = window.getComputedStyle(rail);
      const stageStyle = window.getComputedStyle(stage);
      const buttonTops = railButtons.map((button) => Math.round(button.getBoundingClientRect().top));
      return {
        railDisplay: railStyle.display,
        railFlexDirection: railStyle.flexDirection,
        railGridColumns: railStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
        appGridRows: appStyle.gridTemplateRows,
        stageGridRowStart: stageStyle.gridRowStart,
        railClientWidth: rail.clientWidth,
        railScrollWidth: rail.scrollWidth,
        railClientHeight: rail.clientHeight,
        railScrollHeight: rail.scrollHeight,
        buttonTopCount: new Set(buttonTops).size
      };
    });

    await page.locator('[data-sidebar-section-target="map"]').click();

    const open = await page.evaluate(() => {
      const app = document.querySelector('.app');
      const rail = document.querySelector('.leftRail');
      const drawer = document.querySelector('#contextDrawer');
      const drawerFrame = document.querySelector('#contextDrawer .contextDrawerFrame');
      const railStyle = window.getComputedStyle(rail);
      const drawerStyle = window.getComputedStyle(drawer);
      const frameStyle = window.getComputedStyle(drawerFrame);
      return {
        railDisplay: railStyle.display,
        railFlexDirection: railStyle.flexDirection,
        railGridColumns: railStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
        drawerTop: drawerStyle.top,
        drawerLeft: drawerStyle.left,
        drawerRight: drawerStyle.right,
        drawerWidth: drawerStyle.width,
        drawerTransform: frameStyle.transform,
        fullscreen: app.classList.contains('drawerFullscreen')
      };
    });

    await page.locator('#contextDrawerClose').click();

    const signature = width <= 900
      ? `mobile:${closed.railDisplay}:${closed.railGridColumns}:${closed.stageGridRowStart}:${open.fullscreen}`
      : `desktop:${closed.railDisplay}:${closed.railFlexDirection}:${closed.stageGridRowStart}:${open.fullscreen}`;
    signatures.add(signature);

    if (width <= 900) {
      expect(closed.railDisplay).toBe('grid');
      expect(closed.railGridColumns).toBe(5);
      expect(closed.stageGridRowStart).toBe('2');
      expect(closed.buttonTopCount).toBe(1);
      expect(closed.railScrollWidth).toBe(closed.railClientWidth);
      expect(closed.railScrollHeight).toBe(closed.railClientHeight);
      expect(open.fullscreen).toBe(true);
      expect(open.drawerLeft).toBe('10px');
      expect(open.drawerRight).toBe('10px');
    } else {
      expect(closed.railDisplay).toBe('flex');
      expect(closed.railFlexDirection).toBe('column');
      expect(closed.stageGridRowStart).toBe('auto');
      expect(open.fullscreen).toBe(false);
      expect(open.drawerWidth).toBe('360px');
      expect(open.drawerLeft).toBe('92px');
    }
  }

  expect([...signatures].sort()).toEqual([
    'desktop:flex:column:auto:false',
    'mobile:grid:5:2:true'
  ]);
});

test('shared shell styling keeps the canvas, token rows, and drawer interactive by default', async ({ page }) => {
  await addToken(page, { name: 'Styling Goblin', size: 1, type: 'Monster' });

  const shellStyles = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar');
    const canvas = document.querySelector('#stage');
    const tokenRow = document.querySelector('.tokRow');
    const drawerClose = document.querySelector('#contextDrawerClose');
    if (!topbar || !canvas || !tokenRow || !drawerClose) return null;
    const topbarStyle = window.getComputedStyle(topbar);
    const canvasStyle = window.getComputedStyle(canvas);
    const rowStyle = window.getComputedStyle(tokenRow);
    const drawerCloseStyle = window.getComputedStyle(drawerClose);
    return {
      topbarHidden: topbar.hasAttribute('hidden'),
      canvasCursor: canvasStyle.cursor,
      canvasBackgroundColor: canvasStyle.backgroundColor,
      tokenRowDisplay: rowStyle.display,
      drawerCloseCursor: drawerCloseStyle.cursor
    };
  });

  if (!shellStyles) throw new Error('Shared shell styles unavailable');
  expect(shellStyles.topbarHidden).toBe(true);
  expect(shellStyles.canvasCursor).toBe('grab');
  expect(shellStyles.canvasBackgroundColor).toBe('rgb(8, 16, 34)');
  expect(shellStyles.tokenRowDisplay).toBe('grid');
  expect(shellStyles.drawerCloseCursor).toBe('pointer');
});

test('shared shell typography keeps the default OSS VTT font scale', async ({ page }) => {
  await addToken(page, { name: 'Typography Goblin', size: 1, type: 'Monster' });

  const typography = await page.evaluate(() => {
    const body = document.body;
    const heading = document.querySelector('.panelSection summary h2');
    const tokenMeta = document.querySelector('.tokRow .meta');
    const drawerTitle = document.querySelector('#contextDrawerTitle');
    if (!body || !heading || !tokenMeta || !drawerTitle) return null;
    const bodyStyle = window.getComputedStyle(body);
    const headingStyle = window.getComputedStyle(heading);
    const tokenMetaStyle = window.getComputedStyle(tokenMeta);
    const drawerTitleStyle = window.getComputedStyle(drawerTitle);
    return {
      bodyFontFamily: bodyStyle.fontFamily,
      bodyFontSize: bodyStyle.fontSize,
      headingFontSize: headingStyle.fontSize,
      tokenMetaFontSize: tokenMetaStyle.fontSize,
      drawerTitleFontSize: drawerTitleStyle.fontSize
    };
  });

  if (!typography) throw new Error('Typography styles unavailable');
  expect(typography.bodyFontFamily.toLowerCase()).not.toContain('georgia');
  expect(typography.bodyFontSize).toBe('16px');
  expect(typography.headingFontSize).toBe('14px');
  expect(typography.tokenMetaFontSize).toBe('11px');
  expect(typography.drawerTitleFontSize).toBe('16px');
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

test('plain left drag over empty stage space pans the stage', async ({ page }) => {
  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  const startX = box.x + box.width - 120;
  const startY = box.y + box.height - 120;

  await expect(page.locator('#viewPill')).toContainText('Pan: (0,0)');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 60, { steps: 10 });
  await page.mouse.up();
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
  await expect(page.getByRole('button', { name: 'Run Tactics' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Run Tactics' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();

  await openDrawerTab(page, 'log');
  await expect(page.getByRole('button', { name: 'Run Tactics' })).toBeVisible();
  await expect(page.locator('#autoApplyAI')).toBeChecked();
});

test('AI drawer settings persist across tab changes', async ({ page }) => {
  await openDrawerTab(page, 'settings');
  await page.locator('#apiUrl').fill('http://localhost:3000/api/custom');
  await page.locator('#aiStrategy').selectOption('controller_scripted');
  await page.locator('#aiActivationScope').selectOption('single');

  await openDrawerTab(page, 'packet');
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#apiUrl')).toHaveValue('http://localhost:3000/api/custom');
  await expect(page.locator('#aiStrategy')).toHaveValue('controller_scripted');
  await expect(page.locator('#aiActivationScope')).toHaveValue('single');
  await expect(page.locator('#aiStrategyHint')).toContainText('current token only');
  await expect(page.locator('#aiStrategyHint')).toContainText('portable tactical controller contract');

  await page.locator('#aiStrategy').selectOption('controller_supervisor_scripted');
  await expect(page.locator('#aiStrategyHint')).toContainText('supervisor ranks candidate actions');
  await openDrawerTab(page, 'packet');
  await expect(page.locator('#aiExport')).toHaveValue(/TACTICAL CONTROLLER:/);
});

test('local tactical controllers hot-swap through the same VTT apply contract', async ({ page }) => {
  await addToken(page, { name: 'Goblin', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 0 });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Hero', cellX: 3, cellY: 0 });
  await setAiControls(page, 'Both');
  await setCurrentTurnToken(page, 'Goblin');

  await openDrawerTab(page, 'settings');
  await page.locator('#aiStrategy').selectOption('controller_utility');
  await expect(page.locator('#aiStrategyHint')).toContainText('Runs locally');
  await page.locator('#autoApplyAI').uncheck();
  await page.getByRole('button', { name: 'Run Tactics' }).click();

  await expect(page.locator('#sendStatus')).toContainText('Utility Baseline');
  await openDrawerTab(page, 'apply');
  const plan = await page.evaluate(() => JSON.parse(document.querySelector('#applyJson')?.value || '{}'));
  expect(plan._controller.id).toBe('utility_baseline');
  expect(Array.isArray(plan.moves)).toBe(true);
  expect(Array.isArray(plan.actions)).toBe(true);

  await openDrawerTab(page, 'settings');
  await page.locator('#aiStrategy').selectOption('controller_supervisor_scripted');
  await page.locator('#aiActivationScope').selectOption('single');
  await expect(page.locator('#aiStrategyHint')).toContainText('supervisor ranks candidate actions');
  await page.getByRole('button', { name: 'Run Tactics' }).click();
  await expect(page.locator('#sendStatus')).toContainText('Supervisor + Scripted');
  await openDrawerTab(page, 'apply');
  const supervisedPlan = await page.evaluate(() => JSON.parse(document.querySelector('#applyJson')?.value || '{}'));
  expect(supervisedPlan._controller.id).toBe('supervisor_scripted_single');
});

test('AI rail item opens the unified drawer instead of a floating draggable panel', async ({ page }) => {
  await page.locator('[data-sidebar-section-target="ai"]').click();
  await expect(page.locator('.app')).toHaveClass(/drawerOpen/);
  await expect(page.locator('#aiSection')).toBeVisible();
  await expect(page.locator('#contextDrawerTitle')).toHaveText('Tactics Director');
  await expect(page.locator('#sendState')).toBeVisible();
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

test('adding a tagged SRD monster seeds portable tactical role and behavior metadata', async ({ page }) => {
  await openDetails(page, '#tokensSection');
  await page.locator('#tokName').fill('Wolf');
  await page.locator('#addToken').click();

  await openDetails(page, '#turnSection');
  await page.locator('[data-turn-tab="tactics"]').click();
  await expect(page.locator('#selTacticalRole')).toHaveValue('mobile_striker');
  await expect(page.locator('#selMappedCoreRole')).toHaveValue('skirmisher');
  await expect(page.locator('#selBehaviorCognition')).toHaveValue('animal');
  await expect(page.locator('#selBehaviorCoordination')).toHaveValue('pack');

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  const wolf = snapshot.state.tokens.find((token) => token.name === 'Wolf');
  expect(wolf?.tactical).toMatchObject({
    role: 'mobile_striker',
    coreRole: 'skirmisher'
  });
  expect(wolf?.behavior).toMatchObject({
    cognition: 'animal',
    drive: 'isolate_weak_prey',
    coordination: 'pack'
  });
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

  await openDetails(page, '#tokensSection');
  await tokenRow(page, 'Hero').click();
  await expect(tokenRow(page, 'Hero')).toHaveClass(/selected/);

  await tokenRow(page, 'Goblin A').click({ modifiers: ['Control'] });

  await expect(tokenRow(page, 'Hero')).not.toHaveClass(/selected/);
  await expect(tokenRow(page, 'Hero')).not.toContainText('Grouped');
  await expect(tokenRow(page, 'Goblin A')).toHaveClass(/selected/);
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#aiStrategy')).toHaveValue('controller_supervisor_scripted');
  await expect(page.locator('#aiActivationScope')).toHaveValue('single');
});

test('multi-selecting monsters auto-switches tactics director to group scope', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await addToken(page, { name: 'Goblin B', size: 1, type: 'Monster' });

  await clickTokenOnStage(page, 'Goblin A');
  await clickTokenOnStage(page, 'Goblin B', ['Control']);

  await openDrawerTab(page, 'settings');
  await openDetails(page, '#tokensSection');
  await expect(page.locator('#aiStrategy')).toHaveValue('controller_supervisor_scripted');
  await expect(page.locator('#aiActivationScope')).toHaveValue('group');
  await expect(tokenRow(page, 'Goblin A')).toContainText('Grouped');
  await expect(tokenRow(page, 'Goblin B')).toContainText('Grouped');
  await expect(page.locator('#tokenSelectionNote')).toContainText('2 grouped AI-controlled tokens');
});

test('supervisor group scope preserves ctrl-click grouping and runs local group controller', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await addToken(page, { name: 'Goblin B', size: 1, type: 'Monster' });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Hero', cellX: 4, cellY: 0 });

  await clickTokenOnStage(page, 'Goblin A');
  await openDrawerTab(page, 'settings');
  await page.locator('#aiStrategy').selectOption('controller_supervisor_scripted');
  await page.locator('#aiActivationScope').selectOption('group');
  await expect(page.locator('#aiStrategy')).toHaveValue('controller_supervisor_scripted');
  await expect(page.locator('#aiActivationScope')).toHaveValue('group');

  await closeDrawer(page);
  await clickTokenOnStage(page, 'Goblin B', ['Control']);

  await openDrawerTab(page, 'settings');
  await expect(page.locator('#aiStrategy')).toHaveValue('controller_supervisor_scripted');
  await expect(page.locator('#aiActivationScope')).toHaveValue('group');
  await openDetails(page, '#tokensSection');
  await expect(tokenRow(page, 'Goblin A')).toContainText('Grouped');
  await expect(tokenRow(page, 'Goblin B')).toContainText('Grouped');
  await expect(page.locator('#tokenSelectionNote')).toContainText('Supervisor will use 2 grouped AI-controlled tokens');
  await expect(page.locator('#aiExport')).toHaveValue(/TACTICAL CONTROLLER:/);

  await openDrawerTab(page, 'settings');
  await page.getByRole('button', { name: 'Run Tactics' }).click();

  await expect(page.locator('#sendStatus')).toContainText('Supervisor + Scripted Group');
  await openDrawerTab(page, 'apply');
  const plan = await page.evaluate(() => JSON.parse(document.querySelector('#applyJson')?.value || '{}'));
  expect(plan._controller.id).toBe('supervisor_scripted_group');
});

test('mobile group select mode supports grouped selection without ctrl-click', async ({ page }) => {
  await enableTouchUi(page);
  await page.setViewportSize({ width: 900, height: 1200 });
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await addToken(page, { name: 'Goblin B', size: 1, type: 'Monster' });
  await closeDrawer(page);

  await expect(page.locator('#mobileCanvasToolbar')).toBeVisible();
  await expect(page.locator('#mobileCanvasNavigateBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mobileCanvasMoveBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#mobileCanvasMoveBtn').click();
  await expect(page.locator('#mobileCanvasNavigateBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#mobileCanvasMoveBtn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#mobileCanvasNavigateBtn').click();
  await expect(page.locator('#mobileCanvasNavigateBtn')).toHaveAttribute('aria-pressed', 'true');

  await openDetails(page, '#tokensSection');
  await expect(page.locator('#mobileGroupSelectBtn')).toBeVisible();
  await expect(page.locator('#mobileGroupSelectBtn')).toHaveText('Group Select');

  await page.locator('#mobileGroupSelectBtn').click();
  await expect(page.locator('#mobileGroupSelectBtn')).toHaveText('Done');
  await expect(page.locator('#mobileGroupSelectBtn')).toHaveAttribute('aria-pressed', 'true');

  await tokenRow(page, 'Goblin A').click();

  await closeDrawer(page);
  await openDrawerTab(page, 'settings');
  await expect(page.locator('#aiStrategy')).toHaveValue('controller_supervisor_scripted');
  await expect(page.locator('#aiActivationScope')).toHaveValue('group');
  await closeDrawer(page);
  await openDetails(page, '#tokensSection');
  await expect(tokenRow(page, 'Goblin A')).toContainText('Grouped');
  await expect(tokenRow(page, 'Goblin B')).toContainText('Grouped');
  await expect(page.locator('#tokenSelectionNote')).toContainText('2 grouped AI-controlled tokens');

  await page.locator('#mobileGroupSelectBtn').click();
  await expect(page.locator('#mobileGroupSelectBtn')).toHaveText('Group Select');
  await expect(page.locator('#mobileGroupSelectBtn')).toHaveAttribute('aria-pressed', 'false');
});

test('narrow desktop viewport keeps mobile-only canvas controls hidden', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1200 });
  await closeDrawer(page);

  await expect(page.locator('#mobileCanvasToolbar')).toBeHidden();
  await openDetails(page, '#tokensSection');
  await expect(page.locator('#mobileGroupSelectBtn')).toBeHidden();
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

  await openDetails(page, '#tokensSection');
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

  await setRound(page, '3');
  await setAiControls(page, 'PCs');
  await openDetails(page, '#saveSection');
  await setHiddenInputValue(page, '#saveSlotName', 'Round 3 Start');

  await clickHiddenElement(page, '#saveSlotBtn');
  await expect(page.locator('#saveStateStatus')).toContainText('Round 3 Start');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotSelect')?.value || '')
  )).toMatch(/.+/);

  await openDetails(page, '#tokensSection');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);
  await setRound(page, '1');
  await setAiControls(page, 'Monsters');
  await openDetails(page, '#saveSection');
  await setHiddenInputValue(page, '#saveSlotName', 'Empty Board');
  await clickHiddenElement(page, '#saveSlotBtn');

  await page.evaluate(async () => {
    const selected = window.__VTT_DEBUG__.selectSaveSlotByName('Round 3 Start');
    if (!selected) throw new Error('Round 3 Start slot not found.');
    await window.__VTT_DEBUG__.loadSelectedSaveSlot();
  });

  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot().state.tokens.map((token) => token.name))
  )).toContain('Hero');
  await expect(page.locator('#saveStateStatus')).toContainText('Round 3 Start');
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Hero' })).toHaveCount(1);
  await expectTokenCell(page, 'Hero', 4, 2);
  await expectRound(page, '3');
  await expectAiControls(page, 'PCs');
  await expect.poll(async () => (
    await page.evaluate(() => document.querySelector('#saveSlotName')?.value || '')
  )).toBe('Round 3 Start');

  await page.evaluate(async () => {
    const deleted = await window.__VTT_DEBUG__.deleteSaveSlotByName('Empty Board');
    if (!deleted) throw new Error('Empty Board slot not found.');
  });

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

  await setRound(page, '2');
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

  await setRound(page, '3');
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
  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots().map((slot) => slot.name))
  )).toEqual(['Round 1']);

  await setHiddenInputValue(page, '#saveSlotName', 'Round 2');
  await clickHiddenElement(page, '#saveSlotBtn');
  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots().map((slot) => slot.name))
  )).toEqual(['Round 2', 'Round 1']);

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

  for (const [name, round] of [['Quick Save', '1'], ['Quick Save 3', '3'], ['Quick Save 10', '10']]) {
    await setRound(page, round);
    await openDetails(page, '#saveSection');
    await setHiddenInputValue(page, '#saveSlotName', name);
    await clickHiddenElement(page, '#saveSlotBtn');
    await expect(page.locator('#saveStateStatus')).toContainText(name);
  }

  await expect.poll(async () => (
    await page.evaluate(() => window.__VTT_DEBUG__.getSaveSlots().map((slot) => slot.name))
  )).toEqual(['Quick Save 10', 'Quick Save 3', 'Quick Save']);

  await openDetails(page, '#tokensSection');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);

  await openDetails(page, '#saveSection');
  await selectHiddenOptionByLabel(page, '#saveSlotSelect', 'Quick Save 3');
  await clickHiddenElement(page, '#loadSlotBtn');

  await openDetails(page, '#tokensSection');
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Ranger' })).toHaveCount(1);
  await expectRound(page, '3');
  await openDetails(page, '#saveSection');
  await expect(page.locator('#saveStateStatus')).toContainText('Quick Save 3');
});

test('board snapshots can be exported and imported as json files', async ({ page }) => {
  await addToken(page, { name: 'Mage', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 6, cellY: 4 });
  await setRound(page, '5');
  await openDetails(page, '#saveSection');
  await page.locator('#encounterDescription').fill('A mage tests snapshot persistence.');

  const exported = await page.evaluate(() => JSON.stringify(window.__VTT_DEBUG__.getBoardSnapshot()));
  expect(JSON.parse(exported).state.encounterDescription).toBe('A mage tests snapshot persistence.');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Save' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^drowvtt-board-save-\d{8}-\d{4}\.json$/);

  await openDetails(page, '#tokensSection');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await setRound(page, '1');
  await openDetails(page, '#saveSection');
  await page.locator('#importBoardFile').setInputFiles({
    name: 'restored-board.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported)
  });

  await openDetails(page, '#tokensSection');
  await expectTokenCell(page, 'Mage', 6, 4);
  await expectRound(page, '5');
  await openDetails(page, '#saveSection');
  await expect(page.locator('#saveStateStatus')).toContainText('Imported JSON');
  await expect(page.locator('#encounterDescription')).toHaveValue('A mage tests snapshot persistence.');
});

test('OSS can export the current board as a visible tactical fixture yaml', async ({ page }) => {
  await clearTokens(page);
  await addToken(page, { name: 'Orc', size: 1, type: 'Monster' });
  await addToken(page, { name: 'Aria', size: 1, type: 'PC' });
  await page.evaluate(() => {
    window.__VTT_DEBUG__.setBlockingEdges(['v:6,1', 'v:6,2', 'v:6,3']);
  });
  await setCurrentTurnToken(page, 'Orc');
  await openDetails(page, '#sessionSection');
  await page.locator('#saveSlotName').fill('Long Barrier Export');
  await page.locator('#encounterDescription').fill('Orc should route to a legal javelin lane and avoid the occupied goblin lane.');

  const yaml = await page.evaluate(() => window.__VTT_DEBUG__.getTacticalFixtureYaml());
  const fixture = parseVisibleEncounterFixture(yaml);

  expect(yaml).toContain('title: Long Barrier Export');
  expect(yaml).toContain('  Orc should route to a legal javelin lane and avoid the occupied goblin lane.');
  expect(yaml).toContain('blockingEdges:');
  expect(yaml).toContain('length: 3');
  expect(fixture.id).toBe('long_barrier_export');
  expect(fixture.encounter.activeActorId).toBeTruthy();
  expect(fixture.encounter.actors.map((actor) => actor.name)).toEqual(expect.arrayContaining(['Orc', 'Aria']));
  expect(fixture.encounter.battlefield.edges).toHaveLength(3);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Tactical Fixture' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('long-barrier-export.yaml');
  await expect(page.locator('#saveStateStatus')).toContainText('Exported tactical fixture');
});

test('imported board snapshot tactical metadata reaches tactical fixture yaml', async ({ page }) => {
  const snapshot = cloneBoardSnapshot(LIVE_TACTICAL_METADATA_SNAPSHOT);

  await page.evaluate(async (text) => {
    await window.__VTT_DEBUG__.importBoardSnapshotText(text);
  }, JSON.stringify(snapshot));

  const yaml = await page.evaluate(() => window.__VTT_DEBUG__.getTacticalFixtureYaml());
  const fixture = parseVisibleEncounterFixture(yaml);
  const mage = fixture.encounter.actors.find((actor) => actor.name === 'Mage');

  expect(yaml).toContain('tactical:');
  expect(yaml).toContain('role: boss_caster');
  expect(yaml).toContain('protected_asset: true');
  expect(yaml).toContain('objective_role: ritual_actor');
  expect(yaml).toContain('role_notes: Protected ritual caster');
  expect(yaml).toContain('behavior:');
  expect(yaml).toContain('cognition: cunning');
  expect(yaml).toContain('coordination: commander_led');
  expect(yaml).toContain('attacks:');
  expect(yaml).toContain('name: Dagger');
  expect(yaml).toContain('spells:');
  expect(yaml).toContain('name: Shield');
  expect(mage?.tactical?.role).toBe('boss_caster');
  expect(mage?.tactical?.protectedAsset).toBe(true);
  expect(mage?.behavior).toMatchObject({
    cognition: 'cunning',
    drive: 'complete_objective',
    riskTolerance: 'self_preserving',
    coordination: 'commander_led',
    planningHorizon: 'long',
    targetStickiness: 'high'
  });
  expect(mage?.spells?.map((spell) => spell.name)).toContain('Shield');
  expect(mage?.attacks?.map((attack) => attack.name)).toContain('Dagger');

  const output = await new SupervisorScriptedGroupController().chooseAction({
    encounter: fixture.encounter,
    actorId: fixture.encounter.activeActorId,
    activationGroup: fixture.encounter.activationGroups[0],
    candidateLimit: 24
  });
  const assessment = output.logs.find((entry) => entry.phase === 'battlefield_assessment')?.data?.battlefieldAssessment;
  const roleDiagnostic = output.logs.find((entry) => entry.data?.diagnostics)?.data?.diagnostics?.candidateSetHealth;
  expect(assessment?.protectedAsset).toMatchObject({ id: 'mage-token', name: 'Mage', role: 'support_caster' });
  expect(roleDiagnostic?.role).toBe('support_caster');
  expect(roleDiagnostic?.role).not.toBe('soldier');
  expect(roleDiagnostic?.availableFamilies).toEqual(expect.arrayContaining(['spell_from_current']));
});

test('visible fixture tactical metadata becomes editable live token metadata', async ({ page }) => {
  const fixtureYaml = [
    'id: fixture_authoring_path',
    'title: Fixture Authoring Path',
    'category: custom',
    'description: |',
    '  Fixture actor metadata should become live token metadata.',
    'controllers:',
    '  - supervisor_scripted_group',
    'battlefield:',
    '  width: 8',
    '  height: 6',
    '  gridSize: 64',
    '  blockingEdges: []',
    'activeActor: mage',
    'activationGroups:',
    '  - id: defenders',
    '    actorIds: [mage]',
    '    activationMode: coordinated_sequential',
    'actors:',
    '  - id: mage',
    '    name: Mage',
    '    side: monsters',
    '    position: [2, 2]',
    '    speed: 30',
    '    tactical:',
    '      role: boss_caster',
    '      mapped_core_role: support_caster',
    '      protected_asset: true',
    '      objective_role: ritual_actor',
    '      role_notes: Protected caster from fixture.',
    '    behavior:',
    '      cognition: cunning',
    '      drive: complete_objective',
    '      riskTolerance: self_preserving',
    '      coordination: commander_led',
    '      planningHorizon: long',
    '      targetStickiness: high',
    '    attacks:',
    '      - name: Dagger',
    '        kind: ranged',
    '        rangeFt: 20',
    '        expectedDamage: 5',
    '    spells:',
    '      - name: Shield',
    '        kind: defensive',
    '        target: self',
    '        rangeFt: 0',
    '        expectedValue: 5',
    '        requiresLineOfSight: false',
    '  - id: hero',
    '    name: Aria',
    '    side: heroes',
    '    position: [5, 2]',
    '    speed: 30',
    '    attacks: []',
    'expected:',
    '  must: []',
    '  mustNot: []',
    ''
  ].join('\n');

  await page.evaluate(async (yaml) => {
    await window.__VTT_DEBUG__.loadTacticalFixtureYaml(yaml);
  }, fixtureYaml);

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  const mageToken = snapshot.state.tokens.find((token) => token.id === 'mage');
  expect(mageToken?.tactical).toMatchObject({
    role: 'boss_caster',
    coreRole: 'support_caster',
    protectedAsset: true,
    objectiveRole: 'ritual_actor'
  });
  expect(mageToken?.behavior).toMatchObject({
    cognition: 'cunning',
    coordination: 'commander_led',
    planningHorizon: 'long'
  });
  expect(mageToken?.spells?.map((spell) => spell.name)).toContain('Shield');
  expect(mageToken?.attacks?.map((attack) => attack.name)).toContain('Dagger');

  await setCurrentTurnToken(page, 'Mage');
  await openDetails(page, '#turnSection');
  await page.locator('[data-turn-tab="tactics"]').click();
  await expect(page.locator('#selTacticalRole')).toHaveValue('boss_caster');
  await expect(page.locator('#selMappedCoreRole')).toHaveValue('support_caster');
  await expect(page.locator('#selProtectedAsset')).toBeChecked();
  await expect(page.locator('#selObjectiveRole')).toHaveValue('ritual_actor');
  await expect(page.locator('#selBehaviorCognition')).toHaveValue('cunning');
  await expect(page.locator('#selBehaviorCoordination')).toHaveValue('commander_led');
  await expect(page.locator('#selSpellsJson')).toHaveValue(/Shield/);

  await page.evaluate(() => {
    const setInputValue = (selector, value) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing element: ${selector}`);
      element.value = value;
    };
    setInputValue('#selMappedCoreRole', 'ambusher_bruiser');
    setInputValue('#selBehaviorCognition', 'trained');
    setInputValue('#selBehaviorCoordination', 'squad');
    setInputValue('#selBehaviorDrive', 'protect_master');
    setInputValue('#selSpellsJson', JSON.stringify([
      { name: 'Shield', kind: 'defensive', target: 'self', rangeFt: 0, expectedValue: 5 },
      { name: 'Magic Missile', kind: 'damage', target: 'enemy', rangeFt: 120, expectedValue: 10 }
    ], null, 2));
    window.__VTT_DEBUG__.saveCurrentTurnEditor();
  });

  const editedSnapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  const editedMage = editedSnapshot.state.tokens.find((token) => token.id === 'mage');
  expect(editedMage?.tactical?.coreRole).toBe('ambusher_bruiser');
  expect(editedMage?.behavior).toMatchObject({
    cognition: 'trained',
    coordination: 'squad',
    drive: 'protect_master'
  });
  expect(editedMage?.spells?.map((spell) => spell.name)).toEqual(['Shield', 'Magic Missile']);

  const yaml = await page.evaluate(() => window.__VTT_DEBUG__.getTacticalFixtureYaml());
  const fixture = parseVisibleEncounterFixture(yaml);
  const mage = fixture.encounter.actors.find((actor) => actor.id === 'mage');
  expect(yaml).toContain('mapped_core_role: ambusher_bruiser');
  expect(yaml).toContain('cognition: trained');
  expect(yaml).toContain('coordination: squad');
  expect(mage?.tactical?.coreRole).toBe('ambusher_bruiser');
  expect(mage?.behavior).toMatchObject({
    cognition: 'trained',
    coordination: 'squad',
    drive: 'protect_master'
  });
  expect(mage?.spells?.map((spell) => spell.name)).toContain('Magic Missile');
});

test('tactical fixture export preserves mapped core roles from loaded fixtures', async ({ page }) => {
  const fixtureYaml = fs.readFileSync(
    new URL('./fixtures/stony-shore-export-role.fixture.yaml', import.meta.url),
    'utf8'
  );

  await page.evaluate(async (yaml) => {
    await window.__VTT_DEBUG__.loadTacticalFixtureYaml(yaml);
  }, fixtureYaml);

  const exportedYaml = await page.evaluate(() => window.__VTT_DEBUG__.getTacticalFixtureYaml());
  const exportedFixture = parseVisibleEncounterFixture(exportedYaml);
  const actorsById = Object.fromEntries(exportedFixture.encounter.actors.map((actor) => [actor.id, actor]));

  expect(exportedYaml).toContain('mapped_core_role: ambusher_bruiser');
  expect(exportedYaml).toContain('mapped_core_role: skirmisher');
  expect(exportedYaml).toContain('mapped_core_role: disciplined_blocker');
  expect(actorsById.young_black_dragon?.tactical?.coreRole).toBe('ambusher_bruiser');
  expect(actorsById.giant_crocodile?.tactical?.coreRole).toBe('ambusher_bruiser');
  expect(actorsById.lizardfolk_a?.tactical?.coreRole).toBe('skirmisher');
  expect(actorsById.troll_a?.tactical?.coreRole).toBe('disciplined_blocker');
});

test('legacy board snapshot omits tactical fixture metadata and warns about missing structure', async ({ page }) => {
  const snapshot = cloneBoardSnapshot(LEGACY_BOARD_SNAPSHOT_WITHOUT_TACTICAL);

  await page.evaluate(async (text) => {
    await window.__VTT_DEBUG__.importBoardSnapshotText(text);
  }, JSON.stringify(snapshot));

  const yaml = await page.evaluate(() => window.__VTT_DEBUG__.getTacticalFixtureYaml());
  const fixture = parseVisibleEncounterFixture(yaml);
  const mage = fixture.encounter.actors.find((actor) => actor.name === 'Mage');

  expect(yaml).not.toContain('tactical:');
  expect(yaml).not.toContain('spells:');
  expect(mage?.tactical?.role).toBe('');
  expect(mage?.spells).toEqual([]);

  await openDrawerTab(page, 'settings');
  await page.locator('#autoApplyAI').uncheck();
  await page.getByRole('button', { name: 'Run Tactics' }).click();
  await expect(page.locator('#sendStatus')).toContainText('Supervisor + Scripted');
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Tactical metadata warning: Mage lacks tactical metadata.');
  await expect(page.locator('#logBox')).toContainText('Tactical metadata warning: Mage has Spellcasting text but no structured spells.');
});

test('autosave history can restore a recent board snapshot', async ({ page }) => {
  await openDetails(page, '#saveSection');
  await expect(page.locator('#autosaveEnabled')).toBeChecked();

  await addToken(page, { name: 'Scout', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 2, cellY: 5 });

  await page.waitForFunction(() => window.__VTT_DEBUG__.getAutosaves().length > 0);
  await expect(page.locator('#autosaveSelect option')).toHaveCount(1);

  await openDetails(page, '#tokensSection');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);

  await openDetails(page, '#saveSection');
  await page.getByRole('button', { name: 'Recover' }).click();

  await openDetails(page, '#tokensSection');
  await expectTokenCell(page, 'Scout', 2, 5);
  await openDetails(page, '#saveSection');
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
  await expect(page.locator('#aiActivationScope')).toHaveValue('group');

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

test('manual movement clears the AI trail for the moved token only', async ({ page }) => {
  await addToken(page, { name: 'Goblin A', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 1, cellY: 1 });
  await addToken(page, { name: 'Goblin B', size: 1, type: 'Monster' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin B', cellX: 3, cellY: 1 });

  await clickTokenOnStage(page, 'Goblin A');
  await clickTokenOnStage(page, 'Goblin B', ['Control']);
  await expect(page.locator('#aiActivationScope')).toHaveValue('group');

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

  let overlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(overlay.paths).toHaveLength(2);

  await closeDrawer(page);
  await dragNamedTokenToTopLeftCell(page, { name: 'Goblin A', cellX: 5, cellY: 2 });
  await expectTokenCell(page, 'Goblin A', 5, 2);

  overlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(overlay.paths).toHaveLength(1);
  expect(overlay.paths[0].name).toBe('Goblin B');
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
  await openDrawerTab(page, 'settings');
  await setAiStrategy(page, 'single_tactical', 'Single (Tactical)');
  await page.locator('#autoApplyAI').check();
  await page.getByRole('button', { name: 'Run Tactics' }).click();

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
  await openDrawerTab(page, 'settings');
  await setAiStrategy(page, 'single_tactical', 'Single (Tactical)');
  await page.getByRole('button', { name: 'Run Tactics' }).click();

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

  await openDrawerTab(page, 'apply');
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

test('blocked move-and-attack plans do not execute melee from the unreachable destination for Large creatures', async ({ page }) => {
  await addToken(page, { name: 'Young Black Dragon', size: 2, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 2, cellX: 1, cellY: 1 });
  await addToken(page, { name: 'Blocker', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Blocker', cellX: 3, cellY: 1 });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Hero', cellX: 6, cellY: 1 });
  await setAiControls(page, 'Monsters');
  await setCurrentTurnToken(page, 'Young Black Dragon');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Young Black Dragon advances and bites.',
    moves: [{ token: 'Young Black Dragon', to: [4, 1], path: [[1, 1], [2, 1], [3, 1], [4, 1]] }],
    actions: [{
      token: 'Young Black Dragon',
      type: 'attack',
      target: 'Hero',
      details: 'Bite',
      attack_kind: 'melee',
      range_ft: 5,
      from: [4, 1]
    }],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();

  await expectTokenCell(page, 'Young Black Dragon', 1, 1);
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Move ignored: Young Black Dragon cannot pass through Blocker');
  await expect(page.locator('#logBox')).toContainText('Action ignored after failed move: Young Black Dragon remained at (1,1)');
  await expect(page.locator('#logBox')).toContainText('Action ignored: Young Black Dragon cannot make a melee attack on Hero');
  await expect(page.locator('#logBox')).not.toContainText('Action: Young Black Dragon attack vs Hero');
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

test('blocking edge controls persist edges while allowing manual movement across them', async ({ page }) => {
  await addToken(page, { name: 'Scout', size: 1, type: 'PC' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 0 });

  await openDetails(page, '#mapSection');
  await expect(page.locator('#blockingDrawBtn')).toBeVisible();
  await page.locator('#blockingDrawBtn').click();
  await closeDrawer(page);
  await clickStageWorld(page, 32, 64);

  await expect.poll(async () => page.evaluate(() => window.__VTT_DEBUG__.getBlockingEdges())).toContain('h:0,1');

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  expect(snapshot.state.blockingEdges.edgeKeys).toContain('h:0,1');

  await page.evaluate(() => window.__VTT_DEBUG__.setBlockingEdges([]));
  await expect.poll(async () => page.evaluate(() => window.__VTT_DEBUG__.getBlockingEdges())).toEqual([]);
  await page.evaluate((boardSnapshot) => window.__VTT_DEBUG__.importBoardSnapshotText(JSON.stringify(boardSnapshot)), snapshot);
  await expect.poll(async () => page.evaluate(() => window.__VTT_DEBUG__.getBlockingEdges())).toContain('h:0,1');

  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 1 });

  await expectTokenCell(page, 'Scout', 0, 1);
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).not.toContainText('blocking edge blocks the path');
});

test('blocking edges block ranged tactics attacks through line of fire', async ({ page }) => {
  await addToken(page, { name: 'Archer', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 0 });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Hero', cellX: 0, cellY: 1 });

  await openDetails(page, '#mapSection');
  await page.locator('#blockingDrawBtn').click();
  await closeDrawer(page);
  await clickStageWorld(page, 32, 64);
  await setAiControls(page, 'Both');
  await setCurrentTurnToken(page, 'Archer');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Archer shoots through the wall.',
    moves: [],
    actions: [{ token: 'Archer', type: 'attack', target: 'Hero', details: 'Shortbow', rationale: 'Take the shot.', attack_kind: 'ranged', range_ft: 80 }],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();

  const blockedOverlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(blockedOverlay.sightLines).toHaveLength(1);
  expect(blockedOverlay.sightLines[0]).toMatchObject({
    name: 'Archer',
    targetName: 'Hero',
    blocked: true,
    label: 'Archer blocked line',
    color: '#ff3f8f'
  });
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('blocking edge blocks line of fire');
});

test('AI movement applies a routed path around a blocking edge', async ({ page }) => {
  await addToken(page, { name: 'Pathfinder', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 0 });
  await setAiControls(page, 'Both');
  await setCurrentTurnToken(page, 'Pathfinder');
  await page.evaluate(() => window.__VTT_DEBUG__.setBlockingEdges(['v:1,0']));

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Pathfinder routes around the blocked edge.',
    moves: [{
      token: 'Pathfinder',
      to: [1, 1],
      path: [[0, 0], [0, 1], [1, 1]],
      rationale: 'Avoid the blocked diagonal edge.'
    }],
    actions: [{ token: 'Pathfinder', type: 'dash', target: null, details: 'Route around.', rationale: 'Use the legal path.', attack_kind: null, range_ft: null }],
    end_turn: true
  }));
  await page.locator('#applyBtn').click();

  await expectTokenCell(page, 'Pathfinder', 1, 1);
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Moved Pathfinder -> (1,1)');
  await expect(page.locator('#logBox')).not.toContainText('blocking edge blocks the path');
});

test('ranged tactics attacks draw line-of-sight debug overlays', async ({ page }) => {
  await addToken(page, { name: 'Archer', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 0 });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Hero', cellX: 2, cellY: 0 });
  await setAiControls(page, 'Both');
  await setCurrentTurnToken(page, 'Archer');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Archer takes a clean shot.',
    moves: [],
    actions: [{ token: 'Archer', type: 'attack', target: 'Hero', details: 'Shortbow', rationale: 'Clear line.', attack_kind: 'ranged', range_ft: 80 }],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();

  const overlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(overlay.sightLines).toHaveLength(1);
  expect(overlay.sightLines[0]).toMatchObject({
    name: 'Archer',
    targetName: 'Hero',
    label: 'Archer ranged line',
    color: '#34d5ff'
  });
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('Action: Archer attack vs Hero');
});

test('ranged blocking is enforced when tactics omit attack kind but details match a ranged weapon', async ({ page }) => {
  await addToken(page, { name: 'Goblin', size: 1, type: 'Monster' });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 0, cellY: 0 });
  await addToken(page, { name: 'Hero', size: 1, type: 'PC' });
  await dragNamedTokenToTopLeftCell(page, { name: 'Hero', cellX: 0, cellY: 1 });

  await openDetails(page, '#mapSection');
  await page.locator('#blockingDrawBtn').click();
  await closeDrawer(page);
  await clickStageWorld(page, 32, 64);
  await setAiControls(page, 'Both');
  await setCurrentTurnToken(page, 'Goblin');

  await openDrawerTab(page, 'apply');
  await page.locator('#applyJson').fill(JSON.stringify({
    summary: 'Goblin fires without a structured attack kind.',
    moves: [],
    actions: [{ token: 'Goblin', type: 'attack', target: 'Hero', details: 'Shortbow', rationale: 'Shoot through cover.', attack_kind: null, range_ft: null }],
    end_turn: false
  }));
  await page.locator('#applyBtn').click();

  const overlay = await page.evaluate(() => window.__VTT_DEBUG__.getAiOverlay());
  expect(overlay.sightLines).toHaveLength(1);
  expect(overlay.sightLines[0]).toMatchObject({
    name: 'Goblin',
    targetName: 'Hero',
    blocked: true,
    color: '#ff3f8f'
  });
  await openDrawerTab(page, 'log');
  await expect(page.locator('#logBox')).toContainText('blocking edge blocks line of fire');
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

test('fit map changes the view to frame the map without changing grid size', async ({ page }) => {
  await uploadTestMap(page, { width: 7200, height: 6000 });
  await openDetails(page, '#mapSection');

  const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
  expect(snapshot.state.gridSize).toBe(64);
  expect(snapshot.state.view.zoom).toBeLessThan(1);
  expect(snapshot.state.map.scale).toBe(1);

  await expect(page.locator('#gridPill')).toContainText('64px');
  await expect(page.locator('#viewPill')).not.toContainText('100%');
  await expect(page.locator('#mapPill')).toContainText('off(0,0)');
});

test('wheel zoom changes the view zoom on the stage', async ({ page }) => {
  const before = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot().state.view.zoom);
  expect(before).toBe(1);

  const canvas = page.locator('#stage');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box unavailable');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);

  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.__VTT_DEBUG__.getBoardSnapshot());
    return snapshot.state.view.zoom;
  }).toBeGreaterThan(1);

  await expect(page.locator('#viewPill')).not.toContainText('100%');
});

test('manual calibration measures one cell and then shifts the map alignment', async ({ page }) => {
  await uploadTestMap(page);
  await openDetails(page, '#mapSection');

  await expect(page.locator('#gridCalibrationNote')).toContainText('Current grid: 64px');
  await page.getByRole('button', { name: 'Start calibration' }).click();
  await expect(page.locator('#gridCalibrationNote')).toContainText('step 1 of 2');

  await closeDrawer(page);
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
  await closeDrawer(page);
  await clickStageWorld(page, 20, 20);
  await expect(page.locator('#gridCalibrationNote')).toContainText('adjacent grid line or corner');

  await page.keyboard.press('Escape');

  await expect(page.locator('#gridCalibrationNote')).toContainText('Current grid: 64px');
  await expect(page.locator('#gridSize')).toHaveValue('64');
  await expect(page.locator('#mapPill')).toContainText('off(0,0)');
});
