#!/usr/bin/env node
'use strict';

// Add a tag to thousands of products in one bulk mutation, instead of one
// tagsAdd call per product. Reads a JSON file of product IDs (an array of
// strings, or of {id} objects — either works) and bulk-tags all of them.
//
// Usage:
//   SHOPIFY_STORE_DOMAIN=my-store.myshopify.com \
//   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx \
//   node examples/bulk-add-tag-to-products.js product-ids.json "sale-2026"

const fs = require('fs');
const {
  ShopifyGraphQLClient,
  runBulkMutationAndWait,
  describeBulkOperation,
  isSuccessStatus,
} = require('../src/index');

const MUTATION = `
mutation AddTags($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}
`;

async function main() {
  const [idsFile, tag] = process.argv.slice(2);
  if (!idsFile || !tag) {
    throw new Error('Usage: node examples/bulk-add-tag-to-products.js <ids.json> <tag>');
  }

  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shop || !accessToken) {
    throw new Error('Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN first.');
  }

  const raw = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
  const ids = raw.map((entry) => (typeof entry === 'string' ? entry : entry.id));
  if (ids.length === 0) throw new Error(`${idsFile} contained no product IDs.`);

  const records = ids.map((id) => ({ id, tags: [tag] }));
  const client = new ShopifyGraphQLClient({ shop, accessToken });

  console.error(`Tagging ${records.length} product(s) with "${tag}"...`);
  const bulkOperation = await runBulkMutationAndWait(client, MUTATION, records, {
    onPoll: (op) => console.error(describeBulkOperation(op)),
  });

  if (!isSuccessStatus(bulkOperation.status)) {
    throw new Error(`Bulk mutation did not complete: ${describeBulkOperation(bulkOperation)}`);
  }

  console.error(`Done. ${describeBulkOperation(bulkOperation)}`);
  console.error('Download bulkOperation.url to inspect per-record userErrors, if any.');
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
