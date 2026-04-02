import test from 'node:test';
import assert from 'node:assert/strict';

import { createVttServerApp } from '../server.js';

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function createMockClient({ outputText = '{}', error = null } = {}) {
  return {
    responses: {
      async create() {
        if (error) throw error;
        return {
          output_text: outputText,
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15
          }
        };
      }
    }
  };
}

test('server rejects missing or non-string aiExport', async () => {
  const app = createVttServerApp({
    client: createMockClient()
  });

  await withServer(app, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/vtt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const wrongType = await fetch(`${baseUrl}/api/vtt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aiExport: { nope: true } })
    });

    assert.equal(missing.status, 400);
    assert.deepEqual(await missing.json(), { error: 'aiExport must be a non-empty string.' });
    assert.equal(wrongType.status, 400);
    assert.deepEqual(await wrongType.json(), { error: 'aiExport must be a non-empty string.' });
  });
});

test('server hides backend error details by default', async () => {
  const app = createVttServerApp({
    client: createMockClient({ error: new Error('OpenAI upstream failed loudly') }),
    exposeErrorDetails: false
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/vtt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aiExport: 'turn packet' })
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'Backend failed');
    assert.ok(body._timing);
    assert.equal('details' in body, false);
  });
});

test('server can expose error details when explicitly enabled', async () => {
  const app = createVttServerApp({
    client: createMockClient({ error: new Error('OpenAI upstream failed loudly') }),
    exposeErrorDetails: true
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/vtt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aiExport: 'turn packet' })
    });

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.match(body.details, /OpenAI upstream failed loudly/);
  });
});

test('server only allows localhost origins by default', async () => {
  const app = createVttServerApp({
    client: createMockClient({ outputText: '{"summary":null,"moves":[],"actions":[],"end_turn":true}' })
  });

  await withServer(app, async (baseUrl) => {
    const localhostResponse = await fetch(`${baseUrl}/api/vtt`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173'
      },
      body: JSON.stringify({ aiExport: 'turn packet' })
    });
    const localhostAllowOrigin = localhostResponse.headers.get('access-control-allow-origin');
    const disallowedResponse = await fetch(`${baseUrl}/api/vtt`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example'
      },
      body: JSON.stringify({ aiExport: 'turn packet' })
    });

    assert.equal(localhostResponse.status, 200);
    assert.equal(localhostAllowOrigin, 'http://localhost:5173');
    assert.equal(disallowedResponse.status, 500);
  });
});
