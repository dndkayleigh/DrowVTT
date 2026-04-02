import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAssetStorageAdapter } from '../../data/local-asset-storage-adapter.mjs';

test('local asset storage adapter imports a map file through the configured reader', async () => {
  const adapter = createLocalAssetStorageAdapter({
    readFileAsDataUrl: async (file) => `data:${file.type};base64,abc123`
  });

  const asset = await adapter.importMapFile({
    name: 'dungeon-map.png',
    type: 'image/png'
  });

  assert.equal(asset.kind, 'map');
  assert.equal(asset.fileName, 'dungeon-map.png');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.src, 'data:image/png;base64,abc123');
});

test('local asset storage adapter imports token art through the configured reader', async () => {
  const adapter = createLocalAssetStorageAdapter({
    readFileAsDataUrl: async (file) => `data:${file.type};base64,def456`
  });

  const asset = await adapter.importTokenArtFile({
    name: 'hero-portrait.png',
    type: 'image/png'
  });

  assert.equal(asset.kind, 'token-art');
  assert.equal(asset.fileName, 'hero-portrait.png');
  assert.equal(asset.mimeType, 'image/png');
  assert.equal(asset.src, 'data:image/png;base64,def456');
});

test('local asset storage adapter rejects missing files', async () => {
  const adapter = createLocalAssetStorageAdapter({
    readFileAsDataUrl: async () => 'unused'
  });

  await assert.rejects(async () => {
    await adapter.importMapFile(null);
  }, /No map file selected/);

  await assert.rejects(async () => {
    await adapter.importTokenArtFile(null);
  }, /No token-art file selected/);
});
