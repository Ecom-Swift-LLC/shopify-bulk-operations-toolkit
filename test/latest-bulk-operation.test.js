'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchLatestBulkOperations } = require('../src/latest-bulk-operation');

test('fetchLatestBulkOperations returns the nodes array, newest first, as the API sorts them', async () => {
  const client = {
    request: async (_doc, variables) => {
      assert.equal(variables.first, 1);
      return {
        data: {
          bulkOperations: {
            nodes: [{ id: 'gid://shopify/BulkOperation/9', status: 'COMPLETED' }],
          },
        },
      };
    },
  };
  const nodes = await fetchLatestBulkOperations(client);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, 'gid://shopify/BulkOperation/9');
});

test('fetchLatestBulkOperations passes a custom "first" through', async () => {
  let seenFirst;
  const client = {
    request: async (_doc, variables) => {
      seenFirst = variables.first;
      return { data: { bulkOperations: { nodes: [] } } };
    },
  };
  await fetchLatestBulkOperations(client, { first: 5 });
  assert.equal(seenFirst, 5);
});
