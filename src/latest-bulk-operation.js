'use strict';

const { LATEST_BULK_OPERATIONS } = require('./queries');

/**
 * Fetch the shop's most recent bulk operations (newest first). Replaces
 * the deprecated `currentBulkOperation` field, which the live Admin GraphQL
 * schema flags in favor of this connection as of this repo's validation.
 */
async function fetchLatestBulkOperations(client, { first = 1 } = {}) {
  const { data } = await client.request(LATEST_BULK_OPERATIONS, { first });
  return data.bulkOperations.nodes;
}

module.exports = { fetchLatestBulkOperations };
