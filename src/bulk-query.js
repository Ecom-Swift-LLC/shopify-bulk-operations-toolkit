'use strict';

const { RUN_BULK_QUERY, CANCEL_BULK_OPERATION } = require('./queries');
const { pollBulkOperation } = require('./poll');

/**
 * Submit a GraphQL query as a bulk operation (`bulkOperationRunQuery`).
 * The query must contain at least one connection field — that's a Shopify
 * platform requirement, not something this library can validate locally.
 */
async function submitBulkQuery(client, query) {
  const { data } = await client.request(RUN_BULK_QUERY, { query });
  const { bulkOperation, userErrors } = data.bulkOperationRunQuery;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`bulkOperationRunQuery failed: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  return bulkOperation;
}

/**
 * Submit a bulk query and poll until it finishes. Returns the final
 * BulkOperation node — check `.status` before trusting `.url`.
 */
async function runBulkQueryAndWait(client, query, pollOptions = {}) {
  const submitted = await submitBulkQuery(client, query);
  return pollBulkOperation(client, submitted.id, pollOptions);
}

async function cancelBulkOperation(client, id) {
  const { data } = await client.request(CANCEL_BULK_OPERATION, { id });
  const { bulkOperation, userErrors } = data.bulkOperationCancel;
  if (userErrors && userErrors.length > 0) {
    throw new Error(`bulkOperationCancel failed: ${userErrors.map((e) => e.message).join('; ')}`);
  }
  return bulkOperation;
}

/**
 * Download and parse a completed bulk operation's JSONL result.
 * `url` is a pre-signed link — no Shopify auth header needed or wanted.
 */
async function downloadJsonl(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to download bulk operation result: HTTP ${response.status}`);
  }
  return response.text();
}

module.exports = { submitBulkQuery, runBulkQueryAndWait, cancelBulkOperation, downloadJsonl };
