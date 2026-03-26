import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTokenArtImagePlacement } from '../../data/token-art-utils.mjs';

test('token art placement clamps zoom and pans within the token crop', () => {
  const placement = buildTokenArtImagePlacement(
    { width: 200, height: 100 },
    100,
    { scale: 99, panX: 2, panY: -2 }
  );

  assert.equal(placement.drawW, 600);
  assert.equal(placement.drawH, 300);
  assert.equal(placement.dx, 0);
  assert.equal(placement.dy, -200);
});

test('token art placement stays centered when the image already fits the crop width exactly', () => {
  const placement = buildTokenArtImagePlacement(
    { width: 100, height: 100 },
    100,
    { scale: 1, panX: 0.7, panY: -0.4 }
  );

  assert.equal(placement.drawW, 100);
  assert.equal(placement.drawH, 100);
  assert.equal(Math.abs(placement.dx), 0);
  assert.equal(Math.abs(placement.dy), 0);
});
