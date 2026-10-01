'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildStagedUploadInput,
  extractStagedUploadPath,
  createStagedUpload,
  uploadToStagedTarget,
} = require('../src/staged-upload');

test('buildStagedUploadInput targets BULK_MUTATION_VARIABLES over POST, no fileSize', () => {
  const input = buildStagedUploadInput({ filename: 'vars.jsonl', mimeType: 'text/jsonl' });
  assert.deepEqual(input, {
    filename: 'vars.jsonl',
    mimeType: 'text/jsonl',
    httpMethod: 'POST',
    resource: 'BULK_MUTATION_VARIABLES',
  });
  assert.equal('fileSize' in input, false);
});

test('buildStagedUploadInput defaults filename and mimeType', () => {
  const input = buildStagedUploadInput();
  assert.equal(input.filename, 'bulk_op_vars.jsonl');
  assert.equal(input.mimeType, 'text/jsonl');
});

test('extractStagedUploadPath reads the "key" parameter, not resourceUrl', () => {
  const stagedTarget = {
    url: 'https://storage.example/upload',
    resourceUrl: 'https://storage.example/upload?resource',
    parameters: [
      { name: 'GoogleAccessId', value: 'svc@example.iam.gserviceaccount.com' },
      { name: 'key', value: 'tmp/123/bulk_op_vars.jsonl' },
      { name: 'signature', value: 'abc123' },
    ],
  };
  assert.equal(extractStagedUploadPath(stagedTarget), 'tmp/123/bulk_op_vars.jsonl');
});

test('extractStagedUploadPath throws if the target has no "key" parameter', () => {
  assert.throws(() => extractStagedUploadPath({ parameters: [{ name: 'signature', value: 'x' }] }), /"key"/);
});

test('createStagedUpload surfaces userErrors instead of returning a broken target', async () => {
  const client = {
    request: async () => ({
      data: {
        stagedUploadsCreate: {
          stagedTargets: [],
          userErrors: [{ field: ['input'], message: 'Resource not allowed' }],
        },
      },
    }),
  };
  await assert.rejects(() => createStagedUpload(client), /Resource not allowed/);
});

test('createStagedUpload returns the target plus the extracted stagedUploadPath', async () => {
  const client = {
    request: async (_query, variables) => {
      assert.equal(variables.input[0].resource, 'BULK_MUTATION_VARIABLES');
      return {
        data: {
          stagedUploadsCreate: {
            stagedTargets: [
              {
                url: 'https://storage.example/upload',
                resourceUrl: 'https://storage.example/upload?resource',
                parameters: [{ name: 'key', value: 'tmp/456/vars.jsonl' }],
              },
            ],
            userErrors: [],
          },
        },
      };
    },
  };
  const target = await createStagedUpload(client, { filename: 'vars.jsonl' });
  assert.equal(target.stagedUploadPath, 'tmp/456/vars.jsonl');
  assert.equal(target.url, 'https://storage.example/upload');
});

test('uploadToStagedTarget appends every staged parameter before the file field, then POSTs', async () => {
  const appended = [];
  class FakeFormData {
    append(name, value, filename) {
      appended.push({ name, value, filename });
    }
  }
  class FakeBlob {
    constructor(parts, opts) {
      this.parts = parts;
      this.opts = opts;
    }
  }

  let requestSeen;
  const fetchImpl = async (url, init) => {
    requestSeen = { url, init };
    return { ok: true };
  };

  const stagedTarget = {
    url: 'https://storage.example/upload',
    stagedUploadPath: 'tmp/789/vars.jsonl',
    parameters: [
      { name: 'GoogleAccessId', value: 'svc@example.iam.gserviceaccount.com' },
      { name: 'key', value: 'tmp/789/vars.jsonl' },
    ],
  };

  const path = await uploadToStagedTarget(stagedTarget, '{"id":"1"}\n', {
    filename: 'vars.jsonl',
    fetchImpl,
    FormDataImpl: FakeFormData,
    BlobImpl: FakeBlob,
  });

  assert.equal(path, 'tmp/789/vars.jsonl');
  assert.equal(requestSeen.url, 'https://storage.example/upload');
  assert.equal(requestSeen.init.method, 'POST');
  // every `parameters` entry appended before the file field
  assert.deepEqual(appended.map((a) => a.name), ['GoogleAccessId', 'key', 'file']);
  assert.equal(appended.at(-1).filename, 'vars.jsonl');
});

test('uploadToStagedTarget throws with the response body on a non-OK upload', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });
  await assert.rejects(
    () =>
      uploadToStagedTarget(
        { url: 'https://storage.example/upload', stagedUploadPath: 'x', parameters: [] },
        '{}',
        { fetchImpl, FormDataImpl: class { append() {} }, BlobImpl: class { constructor() {} } }
      ),
    /HTTP 403.*Forbidden/s
  );
});
