'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pollBackoffDelay, pollBulkOperation } = require('../src/poll');

test('pollBackoffDelay doubles each attempt starting from minDelayMs', () => {
  assert.equal(pollBackoffDelay(0, { minDelayMs: 1000, maxDelayMs: 15000 }), 1000);
  assert.equal(pollBackoffDelay(1, { minDelayMs: 1000, maxDelayMs: 15000 }), 2000);
  assert.equal(pollBackoffDelay(2, { minDelayMs: 1000, maxDelayMs: 15000 }), 4000);
});

test('pollBackoffDelay is capped at maxDelayMs', () => {
  assert.equal(pollBackoffDelay(10, { minDelayMs: 1000, maxDelayMs: 15000 }), 15000);
});

test('pollBackoffDelay uses the documented defaults (1s floor, 15s ceiling)', () => {
  assert.equal(pollBackoffDelay(0), 1000);
  assert.equal(pollBackoffDelay(20), 15000);
});

function fakeClient(responses) {
  let call = 0;
  return {
    calls: 0,
    request: async () => {
      const bulkOperation = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return { data: { bulkOperation } };
    },
  };
}

test('pollBulkOperation stops as soon as a terminal status is reached', async () => {
  const client = fakeClient([
    { id: 'gid://1', status: 'RUNNING', objectCount: '10' },
    { id: 'gid://1', status: 'RUNNING', objectCount: '50' },
    { id: 'gid://1', status: 'COMPLETED', objectCount: '100', url: 'https://x/result.jsonl' },
  ]);

  const polls = [];
  const sleeps = [];
  const result = await pollBulkOperation(client, 'gid://1', {
    onPoll: (op) => polls.push(op.status),
    sleepImpl: async (ms) => sleeps.push(ms),
  });

  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(polls, ['RUNNING', 'RUNNING', 'COMPLETED']);
  assert.equal(sleeps.length, 2);
  assert.deepEqual(sleeps, [1000, 2000]);
});

test('pollBulkOperation gives up after maxWaitMs without throwing', async () => {
  let now = 0;
  const realNow = Date.now;
  Date.now = () => now;

  try {
    const client = fakeClient([{ id: 'gid://1', status: 'RUNNING' }]);
    const result = await pollBulkOperation(client, 'gid://1', {
      maxWaitMs: 500,
      sleepImpl: async () => {
        now += 1000;
      },
    });
    assert.equal(result.status, 'RUNNING');
  } finally {
    Date.now = realNow;
  }
});

test('pollBulkOperation with maxWaitMs: 0 returns after a single poll (status check, no wait)', async () => {
  const client = fakeClient([{ id: 'gid://1', status: 'RUNNING' }]);
  const result = await pollBulkOperation(client, 'gid://1', { maxWaitMs: 0, sleepImpl: async () => { throw new Error('should not sleep'); } });
  assert.equal(result.status, 'RUNNING');
});
