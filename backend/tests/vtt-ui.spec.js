import { test, expect } from '@playwright/test';

async function clearTokens(page) {
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page.locator('#tokenList .tokRow')).toHaveCount(0);
}

async function addToken(page, { name, size }) {
  await page.locator('#tokName').fill(name);
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
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: name })).toContainText(`cell=(${x},${y})`);
}

async function setCurrentTurnToken(page, name) {
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
  await expect(page.locator('#apiUrl')).toHaveValue(/http:\/\/localhost:3000\/api\/vtt/);
  await expect(page.locator('canvas')).toBeVisible();
});

test('1x1 tokens snap to the center of a single tile', async ({ page }) => {
  await addToken(page, { name: 'Scout', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 5, cellY: 2 });
  await expectTokenCell(page, 'Scout', 5, 2);
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

  await page.locator('#selSize').selectOption('3');
  await page.locator('#selColor').selectOption('#7dffb2');

  await expect(page.locator('#selSize')).toHaveValue('3');
  await expect(page.locator('#selColor')).toHaveValue('#7dffb2');
  await expectTokenCell(page, 'Knight', 5, 5);
  await expect(page.locator('#tokenList .tokRow').filter({ hasText: 'Knight' })).toContainText('3×3');
});

test('manual AI JSON application moves tokens and writes to the log', async ({ page }) => {
  await addToken(page, { name: 'Ogre', size: 2 });

  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Ogre', to: [6, 5] }],
    actions: [{ token: 'Ogre', type: 'dash', target: null, details: 'Rush forward.' }],
    end_turn: true
  }));
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(page.locator('#applyStatus')).toContainText('Applied');
  await expectTokenCell(page, 'Ogre', 6, 5);
  await expect(page.locator('#logBox')).toContainText('Moved Ogre -> (6,5)');
  await expect(page.locator('#logBox')).toContainText('Action: Ogre dash');
  await expect(page.locator('#logBox')).toContainText('End turn');
});

test('backend auto-apply fills the response box and moves the current token', async ({ page }) => {
  await page.route('http://localhost:3000/api/vtt', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        moves: [{ token: 'Cleric', to: [7, 6] }],
        actions: [{ token: 'Cleric', type: 'dodge', target: null, details: 'Hold position.' }],
        end_turn: true,
        _timing: { total_ms: 12, openai_ms: 9, prep_ms: 1, parse_ms: 1, model: 'gpt-4.1-mini' }
      })
    });
  });

  await addToken(page, { name: 'Cleric', size: 1 });
  await page.locator('#autoApplyAI').check();
  await page.getByRole('button', { name: 'Send state to backend' }).click();

  await expect(page.locator('#sendStatus')).toContainText('AI response');
  await expect(page.locator('#applyJson')).toHaveValue(/"Cleric"/);
  await expectTokenCell(page, 'Cleric', 7, 6);
  await expect(page.locator('#logBox')).toContainText('Moved Cleric -> (7,6)');
});

test('movement rules reject wrong-turn, out-of-range, and overlapping AI moves', async ({ page }) => {
  await addToken(page, { name: 'Guard', size: 1 });
  await dragTokenToTopLeftCell(page, { size: 1, cellX: 6, cellY: 1 });

  await addToken(page, { name: 'Ogre', size: 2 });
  await setCurrentTurnToken(page, 'Guard');
  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Ogre', to: [4, 4] }],
    actions: [],
    end_turn: false
  }));
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#logBox')).toContainText('not the current turn token');

  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Guard', to: [15, 1] }],
    actions: [],
    end_turn: false
  }));
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#logBox')).toContainText('speed 30 ft allows 6 cells, not 9');
  await expectTokenCell(page, 'Guard', 6, 1);

  await page.locator('#applyJson').fill(JSON.stringify({
    moves: [{ token: 'Guard', to: [0, 0] }],
    actions: [],
    end_turn: false
  }));
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('#logBox')).toContainText('space is occupied by Ogre');
  await expectTokenCell(page, 'Guard', 6, 1);
});

test('map controls update the map pill and drag mode label', async ({ page }) => {
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
