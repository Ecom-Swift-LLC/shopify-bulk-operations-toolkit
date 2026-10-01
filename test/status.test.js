'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTerminalStatus, isSuccessStatus, describeBulkOperation } = require('../src/status');

test('isTerminalStatus is true for COMPLETED, FAILED, CANCELED, EXPIRED', () => {
  for (const status of ['COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED']) {
    assert.equal(isTerminalStatus(status), true, status);
  }
});

test('isTerminalStatus is false for CREATED, RUNNING, CANCELING', () => {
  for (const status of ['CREATED', 'RUNNING', 'CANCELING']) {
    assert.equal(isTerminalStatus(status), false, status);
  }
});

test('isSuccessStatus is only true for COMPLETED', () => {
  assert.equal(isSuccessStatus('COMPLETED'), true);
  assert.equal(isSuccessStatus('FAILED'), false);
  assert.equal(isSuccessStatus('RUNNING'), false);
});

test('describeBulkOperation summarizes a completed operation with its result url', () => {
  const line = describeBulkOperation({
    id: 'gid://shopify/BulkOperation/1',
    status: 'COMPLETED',
    objectCount: '1200',
    rootObjectCount: '400',
    url: 'https://storage.example/result.jsonl',
  });
  assert.match(line, /COMPLETED/);
  assert.match(line, /1200/);
  assert.match(line, /result\.jsonl/);
});

test('describeBulkOperation surfaces errorCode and partialDataUrl on failure', () => {
  const line = describeBulkOperation({
    id: 'gid://shopify/BulkOperation/2',
    status: 'FAILED',
    errorCode: 'TIMEOUT',
    partialDataUrl: 'https://storage.example/partial.jsonl',
  });
  assert.match(line, /FAILED/);
  assert.match(line, /TIMEOUT/);
  assert.match(line, /partial\.jsonl/);
});

test('describeBulkOperation reports progress for a still-running operation', () => {
  const line = describeBulkOperation({ id: 'gid://shopify/BulkOperation/3', status: 'RUNNING', objectCount: '50' });
  assert.match(line, /RUNNING/);
  assert.match(line, /50/);
});

test('describeBulkOperation handles a null operation (nothing found)', () => {
  assert.equal(describeBulkOperation(null), 'No bulk operation found.');
});
