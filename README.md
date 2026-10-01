# shopify-bulk-operations-toolkit

Run Shopify Admin API **Bulk Operations** end to end — staged uploads, `bulkOperationRunQuery` / `bulkOperationRunMutation`, status polling, JSONL parsing and building — as a small library and a `sbo` CLI, zero dependencies.

We built this because every store past a few thousand products eventually needs the Bulk Operations API, and that API is three separate mutations plus a two-step file upload plus a polling loop plus a JSONL parser before you've touched your own data. None of that is hard individually; all of it together is exactly the kind of plumbing that's tedious to write correctly and easy to get subtly wrong (wrong `httpMethod`, uploading the file field before the auth parameters, trusting `currentBulkOperation`, which the schema now deprecates). This wraps it once so you don't have to.

**Free audit for your own store while you're here:** [audit.ecomswiftllc.com](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-bulk-operations-toolkit) checks SEO, speed, CRO and AI-visibility in one pass.

## Example

```
$ export SHOPIFY_STORE_DOMAIN=my-store.myshopify.com
$ export SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx

$ sbo run-query queries/all-product-titles.graphql --wait
gid://shopify/BulkOperation/123456789: CREATED — 0 object(s) processed so far
gid://shopify/BulkOperation/123456789: RUNNING — 4213 object(s) processed so far
gid://shopify/BulkOperation/123456789: COMPLETED — 9540 object(s) (4800 root) — https://storage.googleapis.com/shopify-tiers-assets-prod-us-east1/.../res.jsonl
{
  "id": "gid://shopify/BulkOperation/123456789",
  "status": "COMPLETED",
  "objectCount": "9540",
  "rootObjectCount": "4800",
  "url": "https://storage.googleapis.com/.../res.jsonl",
  "type": "QUERY"
}

$ sbo download "https://storage.googleapis.com/.../res.jsonl" --out products.jsonl
Wrote products.jsonl
```

```js
// As a library — stage, upload, submit, and poll a bulk mutation in one call.
const { ShopifyGraphQLClient, runBulkMutationAndWait } = require('shopify-bulk-operations-toolkit');

const client = new ShopifyGraphQLClient({
  shop: process.env.SHOPIFY_STORE_DOMAIN,
  accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
});

const mutation = `
  mutation AddTags($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node { id }
      userErrors { field message }
    }
  }
`;

const records = productIds.map((id) => ({ id, tags: ['sale-2026'] }));
const result = await runBulkMutationAndWait(client, mutation, records);
console.log(result.status); // COMPLETED
```

## Features

- **The full round trip, wired correctly.** `stagedUploadsCreate` → multipart upload (every `parameters` entry appended *before* the file field — get the order wrong and Shopify's storage backend rejects the upload) → `bulkOperationRunMutation` with the `key` parameter as `stagedUploadPath` (not `resourceUrl`, the mistake this toolkit exists to avoid) → poll → download → parse.
- **Exponential-backoff polling**, 1s floor up to a 15s ceiling, not a fixed interval that either hammers the API on fast jobs or lags on slow ones. Pass `onPoll` to log progress as it runs.
- **JSONL in both directions.** `parseJsonl` for bulk-query results (skips the trailing blank line every result file ends with), `buildMutationVariablesJsonl` for bulk-mutation input, and `groupBulkQueryResult` to re-nest a flat result by Shopify's `__parentId` convention back into parent/children objects.
- **Cost-aware GraphQL client.** Retries on HTTP 429 (honoring `Retry-After`) and on `THROTTLED` cost errors, shared with our other Admin API tools — the mutations and polling queries that submit and track bulk operations are themselves normal, cheap GraphQL calls subject to the same cost budget as everything else.
- **Uses `bulkOperations` instead of the deprecated `currentBulkOperation`.** The live schema flags `currentBulkOperation` in newer API versions; this toolkit queries the `bulkOperations` connection (`first: 1`, sorted newest-first) instead, so it keeps working as Shopify's schema moves on.
- **Zero runtime dependencies.** Node's built-in `fetch`, `FormData`, and `Blob` only — nothing to audit in `node_modules`.
- **Usable as a library, not just a CLI.** Every CLI command is a thin wrapper over an exported function — `submitBulkQuery`, `stageAndSubmitBulkMutation`, `pollBulkOperation`, etc. — so you can drop it into your own script or CI job.

## Installation

```bash
npx shopify-bulk-operations-toolkit --help
# or
npm install -g shopify-bulk-operations-toolkit
```

Requires Node.js 18+ (for global `fetch`, `FormData`, and `Blob`).

### Getting an access token

1. In your store admin: **Settings → Apps and sales channels → Develop apps → Create an app.**
2. Under **Configuration → Admin API integration**, grant the scopes your query or mutation actually touches (e.g. `read_products` to export products, `write_products` to bulk-tag them).
3. Install the app and copy the **Admin API access token** (`shpat_...`).
4. Export it, together with your store domain:

```bash
export SHOPIFY_STORE_DOMAIN=my-store.myshopify.com
export SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Usage

```
sbo run-query <file.graphql>                   Submit a bulk query, print the operation id
sbo run-mutation <file.graphql> <vars.jsonl>   Stage-upload vars.jsonl, submit a bulk mutation
sbo status [id]                                Show one bulk operation (latest, if id omitted)
sbo wait <id>                                  Poll an operation until it finishes
sbo download <url> [--out file]                Download a completed operation's JSONL result
sbo cancel <id>                                Cancel a running bulk operation
sbo --help                                     Show this help
sbo --version                                  Show the installed version
```

Add `--wait` to `run-query` or `run-mutation` to poll until the operation finishes instead of just printing the submitted operation's id.

```bash
# Export every product and its variants as a bulk query, waiting for it to finish
sbo run-query queries/all-products.graphql --wait > result.json

# Just submit it and check back later
sbo run-query queries/all-products.graphql
sbo status gid://shopify/BulkOperation/123456789

# Bulk-import: one line of mutation variables per record (see examples/product-tags.sample.jsonl)
sbo run-mutation mutations/tag-add.graphql examples/product-tags.sample.jsonl --wait

# Download a completed operation's JSONL result by URL
sbo download "https://storage.googleapis.com/..." --out result.jsonl

# Cancel a bulk operation that's taking too long
sbo cancel gid://shopify/BulkOperation/123456789
```

Both [`queries/all-products.graphql`](queries/all-products.graphql) and [`mutations/tag-add.graphql`](mutations/tag-add.graphql) ship in this repo and are validated against the live Admin GraphQL schema — copy them as a starting point for your own query or mutation.

A `<vars.jsonl>` file for `run-mutation` is one JSON object per line, each line the `variables` for one execution of the mutation — see `buildMutationVariablesJsonl` below if you'd rather generate it from an array than hand-write it.

### As a library

```js
const {
  ShopifyGraphQLClient,
  runBulkQueryAndWait,
  runBulkMutationAndWait,
  downloadJsonl,
  parseJsonl,
  groupBulkQueryResult,
  buildMutationVariablesJsonl,
} = require('shopify-bulk-operations-toolkit');

const client = new ShopifyGraphQLClient({
  shop: process.env.SHOPIFY_STORE_DOMAIN,
  accessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
});

// Bulk query: submit, poll, download, parse, re-nest.
const op = await runBulkQueryAndWait(client, '{ products { edges { node { id title variants { edges { node { id sku } } } } } } }');
const rows = parseJsonl(await downloadJsonl(op.url));
const products = groupBulkQueryResult(rows, 'variants');

// Bulk mutation: pass an array of records straight through.
const records = products.map((p) => ({ id: p.id, tags: ['reviewed'] }));
await runBulkMutationAndWait(client, tagsAddMutation, records);

// Or build the JSONL yourself and hand it to the lower-level functions.
const jsonl = buildMutationVariablesJsonl(records);
```

See `examples/` for two complete, runnable scripts: [`export-all-products.js`](examples/export-all-products.js) (bulk query → download → re-nest → write JSON) and [`bulk-add-tag-to-products.js`](examples/bulk-add-tag-to-products.js) (read a list of product IDs, bulk-tag every one of them in a single mutation).

## What it does NOT do

- **Doesn't validate your query or mutation before submitting it.** A bulk query must include at least one connection field and supports up to five connections with a maximum nesting depth of two levels — that's a Shopify platform rule, not something this library checks locally. A bad query fails after submission, not before.
- **Doesn't group nested results for you unless you ask.** `bulkOperationRunQuery` can return pre-grouped JSONL (`groupObjects: true`), which this toolkit doesn't expose as an option — enabling it slows bulk operations down and isn't the common case. Use `groupBulkQueryResult` on the default flat output instead.
- **Doesn't inspect per-record `userErrors` from a bulk mutation for you.** `bulkOperationRunMutation`'s result JSONL contains one line per input record, each with its own `userErrors` array — download and parse `bulkOperation.url` yourself to check which records actually failed; a `COMPLETED` status means the operation ran, not that every record succeeded.
- **Doesn't retry a failed bulk operation.** If `status` comes back `FAILED`, this toolkit surfaces `errorCode` and `partialDataUrl` (see `describeBulkOperation`) and stops — resubmitting is a decision for your code, since blindly retrying an import can double-write already-succeeded records.
- **Doesn't manage concurrency limits.** Shopify allows one bulk query and one bulk mutation running at a time per shop (the exact concurrent-operation limit depends on your API plan) — submitting a second one while the first is still running gets you an `OPERATION_IN_PROGRESS` user error, which this toolkit surfaces but doesn't queue around.
- **Only Admin API bulk operations.** Nothing here touches the Storefront API, the Partner API, or Shopify Functions — see "Related Shopify tools" for those.

## FAQ

**Why not just paginate the normal way with `first`/`after`?**
You can, for anything under a few thousand records — see our [`shopify-order-export-cli`](https://github.com/Ecom-Swift-LLC/shopify-order-export-cli) for that pattern. Bulk Operations exist for the case where normal pagination would take hundreds of requests and tie up your query-cost budget; Shopify runs the whole thing asynchronously on its side instead.

**Can I run a bulk query and a bulk mutation at the same time?**
Yes — per Shopify's docs, one bulk query and one bulk mutation operation can run concurrently per shop. Two bulk mutations (or two bulk queries) at once is what triggers `OPERATION_IN_PROGRESS`.

**How long do results stay available?**
Seven days. The `url` and `partialDataUrl` fields expire after that — download promptly if you need the data kept.

**Does `sbo wait` / `--wait` ever time out?**
Not by default — it polls until the operation reaches COMPLETED, FAILED, CANCELED, or EXPIRED. Pass `maxWaitMs` when using the library functions directly if you want a cap instead.

If bulk operations are just one piece of the Admin API work on your plate, our [free Shopify tools](https://www.ecomswiftllc.com/free-tools) and [store audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-bulk-operations-toolkit) (SEO, speed, CRO, AI visibility) cover the storefront side.

## Related Shopify tools

- [`shopify-order-export-cli`](https://github.com/Ecom-Swift-LLC/shopify-order-export-cli) — normal cursor-paginated order export and revenue reporting; the right tool below bulk-operation scale.
- [`shopify-metafields-manager`](https://github.com/Ecom-Swift-LLC/shopify-metafields-manager) — bulk metafield import via `metafieldsSet` in batches, a different (synchronous, 25-per-call) bulk pattern than this toolkit's asynchronous JSONL import.
- [`shopify-api-python-client`](https://github.com/EcomswiftLLC/shopify-api-python-client) — a Python Admin API client with its own cost-aware pacing, for teams not on Node.
- [`shopify-storefront-graphql-examples`](https://github.com/Ecom-Swift-LLC/shopify-storefront-graphql-examples) — the Storefront API side (products, search, cart), which Bulk Operations doesn't cover.
- [`shopify-webhook-toolkit`](https://github.com/EcomswiftLLC/shopify-webhook-toolkit) — verify, log, and replay webhooks locally, for the real-time half of keeping your own data in sync.

## Contributing

Issues and PRs welcome — especially a `--group-objects` passthrough for bulk queries that genuinely need Shopify's pre-grouped JSONL, a streaming (rather than whole-file) JSONL parser for very large results, and reports from any newer API version where a field in `queries.js` has moved again.

## Roadmap

- A streaming `parseJsonlStream` for multi-gigabyte results, instead of reading the whole file into memory.
- `sbo watch` — subscribe to the `bulk_operations/finish` webhook topic as an alternative to polling, for long-running CI jobs.
- A `--concurrency-safe` flag on `run-mutation` that checks `bulkOperations` for an in-progress operation first and waits its turn instead of failing with `OPERATION_IN_PROGRESS`.

## License

MIT © Ecom Swift LLC

## Need help?

This project is maintained by **Ecom Swift LLC**, a Shopify Partner.

- 🛍️ Shopify Partner Directory: https://www.shopify.com/partners/directory/partner/waowy
- ✉️ Email: support@ecomswiftllc.com
- 💬 WhatsApp: https://wa.me/16312511767

---

Need bulk operations, custom Admin API tooling, or a Shopify Function built for your store? [Get a free store audit](https://audit.ecomswiftllc.com/?utm_source=github&utm_medium=repo&utm_campaign=shopify-bulk-operations-toolkit) (SEO, speed, CRO, AI visibility) or browse our other [free Shopify tools](https://www.ecomswiftllc.com/free-tools). We're **Ecom Swift LLC**, a Shopify Partner Agency — [www.ecomswiftllc.com](https://www.ecomswiftllc.com).
