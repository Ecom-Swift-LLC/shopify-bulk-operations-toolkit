'use strict';

const { RUN_BULK_MUTATION } = require('./queries');
const { createStagedUpload, uploadToStagedTarget } = require('./staged-upload');
const { pollBulkOperation } = require('./poll');
const { buildMutationVariablesJsonl } = require('./jsonl');

/**
 * Submit a GraphQL mutation as a bulk operation (`bulkOperationRunMutation`).
 * `stagedUploadPath` must already point at an uploaded JSONL file — use
 * `stageAndSubmitBulkMutation` below unless you're managing the staged
 * upload yourself.
 */
async function submitBulkMutation(client, mutation, stagedUploadPath) {
  const { data } = await client.request(RUN_BULK_MUTATION, { mutation, stagedUploadPath });
  const { bulkOperation, userErrors } = data.bulkOperationRunMutation;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`bulkOperationRunMutation failed: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  return bulkOperation;
}

/**
 * The full bulk-import flow: stage an upload, send the JSONL (either a
 * pre-built string or an array of records, each becoming one line of
 * mutation variables), then submit the bulk mutation against it.
 */
async function stageAndSubmitBulkMutation(client, mutation, recordsOrJsonl, { filename, fetchImpl, FormDataImpl, BlobImpl } = {}) {
  const jsonl = Array.isArray(recordsOrJsonl) ? buildMutationVariablesJsonl(recordsOrJsonl) : recordsOrJsonl;
  const stagedTarget = await createStagedUpload(client, { filename });
  await uploadToStagedTarget(stagedTarget, jsonl, { filename, fetchImpl, FormDataImpl, BlobImpl });
  return submitBulkMutation(client, mutation, stagedTarget.stagedUploadPath);
}

/**
 * Same as `stageAndSubmitBulkMutation`, but polls until the bulk mutation
 * finishes before returning.
 */
async function runBulkMutationAndWait(client, mutation, recordsOrJsonl, options = {}) {
  const { filename, fetchImpl, FormDataImpl, BlobImpl, ...pollOptions } = options;
  const submitted = await stageAndSubmitBulkMutation(client, mutation, recordsOrJsonl, { filename, fetchImpl, FormDataImpl, BlobImpl });
  return pollBulkOperation(client, submitted.id, pollOptions);
}

module.exports = { submitBulkMutation, stageAndSubmitBulkMutation, runBulkMutationAndWait };
