'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { submitBulkQuery, cancelBulkOperation, downloadJsonl } = require('../src/bulk-query');

test('submitBulkQuery sends the query string as the bulk operation and returns the node', async () => {
  let seenQuery;
  const client = {
    request: async (_doc, variables) => {
      seenQuery = variables.query;
      return {
        data: {
          bulkOperationRunQuery: {
            bulkOperation: { id: 'gid://shopify/BulkOperation/1', status: 'CREATED' },
            userErrors: [],
          },
        },
      };
    },
  };

  const op = await submitBulkQuery(client, '{ products { edges { node { id } } } }');
  assert.equal(seenQuery, '{ products { edges { node { id } } } }');
  assert.equal(op.id, 'gid://shopify/BulkOperation/1');
});

test('submitBulkQuery throws on userErrors instead of returning a null bulkOperation', async () => {
  const client = {
    request: async () => ({
      data: {
        bulkOperationRunQuery: {
          bulkOperation: null,
          userErrors: [{ field: ['query'], message: 'Query must include a connection field' }],
        },
      },
    }),
  };
  await assert.rejects(() => submitBulkQuery(client, '{ shop { name } }'), /connection field/);
});

test('cancelBulkOperation returns the updated node on success', async () => {
  const client = {
    request: async () => ({
      data: {
        bulkOperationCancel: {
          bulkOperation: { id: 'gid://shopify/BulkOperation/1', status: 'CANCELING' },
          userErrors: [],
        },
      },
    }),
  };
  const op = await cancelBulkOperation(client, 'gid://shopify/BulkOperation/1');
  assert.equal(op.status, 'CANCELING');
});

test('cancelBulkOperation surfaces userErrors (e.g. already completed)', async () => {
  const client = {
    request: async () => ({
      data: {
        bulkOperationCancel: {
          bulkOperation: null,
          userErrors: [{ field: [], message: 'Cannot cancel a completed operation' }],
        },
      },
    }),
  };
  await assert.rejects(() => cancelBulkOperation(client, 'gid://1'), /Cannot cancel/);
});

test('downloadJsonl returns the raw JSONL body, unauthenticated (pre-signed URL)', async () => {
  let seenHeaders;
  const fetchImpl = async (url, init) => {
    seenHeaders = init;
    return { ok: true, text: async () => '{"id":"1"}\n{"id":"2"}\n' };
  };
  const body = await downloadJsonl('https://storage.example/result.jsonl', { fetchImpl });
  assert.equal(body, '{"id":"1"}\n{"id":"2"}\n');
  assert.equal(seenHeaders, undefined);
});

test('downloadJsonl throws on a non-OK response', async () => {
  const fetchImpl = async () => ({ ok: false, status: 410 });
  await assert.rejects(() => downloadJsonl('https://storage.example/expired.jsonl', { fetchImpl }), /HTTP 410/);
});
