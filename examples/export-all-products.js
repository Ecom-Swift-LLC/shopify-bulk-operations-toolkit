#!/usr/bin/env node
'use strict';

// Export every product and variant on a store — however many thousand that
// is — as a single bulk query. No manual pagination, no cursor bookkeeping.
//
// Usage:
//   SHOPIFY_STORE_DOMAIN=my-store.myshopify.com \
//   SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx \
//   node examples/export-all-products.js [--out products.json]

const fs = require('fs');
const {
  ShopifyGraphQLClient,
  runBulkQueryAndWait,
  downloadJsonl,
  parseJsonl,
  groupBulkQueryResult,
  describeBulkOperation,
  isSuccessStatus,
} = require('../src/index');

const QUERY = `
{
  products {
    edges {
      node {
        id
        title
        handle
        variants {
          edges {
            node {
              id
              sku
              price
            }
          }
        }
      }
    }
  }
}
`;

async function main() {
  const shop = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shop || !accessToken) {
    throw new Error('Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN first.');
  }

  const client = new ShopifyGraphQLClient({ shop, accessToken });

  console.error('Submitting bulk query...');
  const bulkOperation = await runBulkQueryAndWait(client, QUERY, {
    onPoll: (op) => console.error(describeBulkOperation(op)),
  });

  if (!isSuccessStatus(bulkOperation.status)) {
    throw new Error(`Bulk query did not complete: ${describeBulkOperation(bulkOperation)}`);
  }

  if (!bulkOperation.url) {
    console.error('Completed with zero products — nothing to download.');
    return;
  }

  console.error('Downloading result...');
  const jsonl = await downloadJsonl(bulkOperation.url);
  const rows = parseJsonl(jsonl);
  // Product rows carry a child connection named via the GraphQL alias in the
  // query ("variants"); every row's __parentId links a variant back to its
  // product. `groupBulkQueryResult` turns that flat JSONL back into nested
  // product -> variants[] objects.
  const products = groupBulkQueryResult(rows, 'variants');

  const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  const output = JSON.stringify(products, null, 2) + '\n';

  if (outPath) {
    fs.writeFileSync(outPath, output);
    console.error(`Wrote ${products.length} product(s) to ${outPath}`);
  } else {
    process.stdout.write(output);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
