'use strict';

const { STAGED_UPLOADS_CREATE } = require('./queries');

/**
 * Build the `StagedUploadInput` for a bulk-mutation variables file.
 * `fileSize` is intentionally omitted — it's only required for VIDEO and
 * MODEL_3D resources, not BULK_MUTATION_VARIABLES.
 */
function buildStagedUploadInput({ filename = 'bulk_op_vars.jsonl', mimeType = 'text/jsonl' } = {}) {
  return {
    filename,
    mimeType,
    httpMethod: 'POST',
    resource: 'BULK_MUTATION_VARIABLES',
  };
}

/**
 * The `key` parameter in a staged target's `parameters` array is the value
 * `bulkOperationRunMutation` expects as `stagedUploadPath` — everything
 * else in `parameters` is upload authentication, not a Shopify-side path.
 */
function extractStagedUploadPath(stagedTarget) {
  const keyParam = (stagedTarget.parameters || []).find((p) => p.name === 'key');
  if (!keyParam) {
    throw new Error('Staged upload target did not include a "key" parameter');
  }
  return keyParam.value;
}

/**
 * Step 1 of the two-step staged upload: ask Shopify for a signed target.
 */
async function createStagedUpload(client, { filename, mimeType } = {}) {
  const input = [buildStagedUploadInput({ filename, mimeType })];
  const { data } = await client.request(STAGED_UPLOADS_CREATE, { input });
  const { stagedTargets, userErrors } = data.stagedUploadsCreate;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`stagedUploadsCreate failed: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  const [target] = stagedTargets;
  return { ...target, stagedUploadPath: extractStagedUploadPath(target) };
}

/**
 * Step 2: POST the file to the signed target. Every `parameters` entry
 * must be appended to the multipart body before the file field — Shopify's
 * cloud-storage backend reads form fields in order and rejects the upload
 * if `file` isn't last.
 */
async function uploadToStagedTarget(stagedTarget, fileContent, { filename = 'bulk_op_vars.jsonl', fetchImpl = fetch, FormDataImpl = FormData, BlobImpl = Blob } = {}) {
  const form = new FormDataImpl();
  for (const { name, value } of stagedTarget.parameters) {
    form.append(name, value);
  }
  const blob = typeof fileContent === 'string' ? new BlobImpl([fileContent], { type: 'text/jsonl' }) : fileContent;
  form.append('file', blob, filename);

  const response = await fetchImpl(stagedTarget.url, { method: 'POST', body: form });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Staged upload failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  return stagedTarget.stagedUploadPath;
}

module.exports = { buildStagedUploadInput, extractStagedUploadPath, createStagedUpload, uploadToStagedTarget };
