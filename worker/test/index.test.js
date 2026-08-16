import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

function scanRequest(origin = 'https://lilwiamtogs.github.io') {
  return new Request('https://atlas.example/scan', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.8' },
    body: JSON.stringify({ image: 'data:image/png;base64,AA==' }),
  });
}

test('rejects a disallowed browser origin before using AI', async () => {
  let limited = false;
  const response = await worker.fetch(scanRequest('https://attacker.example'), {
    SCAN_RATE_LIMITER: { limit: async () => { limited = true; return { success: true }; } },
  });
  assert.equal(response.status, 403);
  assert.equal(limited, false);
});

test('returns 429 before parsing or invoking AI when scan allowance is exhausted', async () => {
  let aiUsed = false;
  const response = await worker.fetch(scanRequest(), {
    SCAN_RATE_LIMITER: { limit: async () => ({ success: false }) },
    AI: { run: async () => { aiUsed = true; } },
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(aiUsed, false);
  assert.deepEqual(await response.json(), { error: 'Too many AI scans. Wait a minute, then try again.' });
});
