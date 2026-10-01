'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { submitBulkMutation, stageAndSubmitBulkMutation } = require('../src/bulk-mutation');

test('submitBulkMutation passes the mutation document and stagedUploadPath through verbatim', async () => {
  let seenVariables;
  const client = {
    request: async (_doc, variables) => {
      seenVariables = variables;
      return {
        data: {
          bulkOperationRunMutation: {
            bulkOperation: { id: 'gid://shopify/BulkOperation/2', status: 'CREATED' },
            userErrors: [],
          },
        },
      };
    },
  };

  const op = await submitBulkMutation(client, 'mutation { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }', 'tmp/1/vars.jsonl');
  assert.equal(seenVariables.stagedUploadPath, 'tmp/1/vars.jsonl');
  assert.equal(op.id, 'gid://shopify/BulkOperation/2');
});

test('submitBulkMutation throws on userErrors (e.g. a bulk mutation already in progress)', async () => {
  const client = {
    request: async () => ({
      data: {
        bulkOperationRunMutation: {
          bulkOperation: null,
          userErrors: [{ field: [], message: 'A bulk mutation operation is already in progress' }],
        },
      },
    }),
  };
  await assert.rejects(() => submitBulkMutation(client, 'mutation {}', 'tmp/x'), /already in progress/);
});

test('stageAndSubmitBulkMutation wires an array of records through buildMutationVariablesJsonl, staging, then submission', async () => {
  let uploadedBody;
  let submittedPath;

  const client = {
    request: async (doc, variables) => {
      if (doc.includes('StagedUploadsCreate')) {
        assert.equal(variables.input[0].resource, 'BULK_MUTATION_VARIABLES');
        return {
          data: {
            stagedUploadsCreate: {
              stagedTargets: [
                {
                  url: 'https://storage.example/upload',
                  resourceUrl: 'https://storage.example/upload?r',
                  parameters: [{ name: 'key', value: 'tmp/2/vars.jsonl' }],
                },
              ],
              userErrors: [],
            },
          },
        };
      }
      if (doc.includes('RunBulkMutation')) {
        submittedPath = variables.stagedUploadPath;
        return {
          data: {
            bulkOperationRunMutation: {
              bulkOperation: { id: 'gid://shopify/BulkOperation/3', status: 'CREATED' },
              userErrors: [],
            },
          },
        };
      }
      throw new Error(`Unexpected query: ${doc}`);
    },
  };

  class FakeFormData {
    append() {}
  }
  class FakeBlob {
    constructor(parts) {
      uploadedBody = parts[0];
    }
  }
  const fetchImpl = async () => ({ ok: true });

  const op = await stageAndSubmitBulkMutation(
    client,
    'mutation RunIt($id: ID!) { tagsAdd(id: $id) { userErrors { message } } }',
    [{ id: 'gid://shopify/Product/1', tags: ['sale'] }],
    { fetchImpl, FormDataImpl: FakeFormData, BlobImpl: FakeBlob }
  );

  assert.equal(uploadedBody, '{"id":"gid://shopify/Product/1","tags":["sale"]}\n');
  assert.equal(submittedPath, 'tmp/2/vars.jsonl');
  assert.equal(op.id, 'gid://shopify/BulkOperation/3');
});

test('stageAndSubmitBulkMutation accepts a pre-built JSONL string unchanged', async () => {
  let uploadedBody;
  const client = {
    request: async (doc) => {
      if (doc.includes('StagedUploadsCreate')) {
        return {
          data: {
            stagedUploadsCreate: {
              stagedTargets: [{ url: 'https://x/upload', parameters: [{ name: 'key', value: 'tmp/3/vars.jsonl' }] }],
              userErrors: [],
            },
          },
        };
      }
      return {
        data: { bulkOperationRunMutation: { bulkOperation: { id: 'gid://4', status: 'CREATED' }, userErrors: [] } },
      };
    },
  };
  class FakeFormData {
    append() {}
  }
  class FakeBlob {
    constructor(parts) {
      uploadedBody = parts[0];
    }
  }
  await stageAndSubmitBulkMutation(client, 'mutation {}', '{"id":"preformatted"}\n', {
    fetchImpl: async () => ({ ok: true }),
    FormDataImpl: FakeFormData,
    BlobImpl: FakeBlob,
  });
  assert.equal(uploadedBody, '{"id":"preformatted"}\n');
});
