#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ShopifyGraphQLClient,
  ShopifyGraphQLError,
  submitBulkQuery,
  runBulkQueryAndWait,
  cancelBulkOperation,
  downloadJsonl,
  stageAndSubmitBulkMutation,
  runBulkMutationAndWait,
  fetchLatestBulkOperations,
  pollBulkOperation,
  describeBulkOperation,
  isSuccessStatus,
} = require('../src/index');

const HELP = `sbo — Shopify Admin API Bulk Operations CLI

Usage:
  sbo run-query <file.graphql>            Submit a bulk query, print the operation id
  sbo run-mutation <file.graphql> <vars.jsonl>  Stage-upload vars.jsonl, submit a bulk mutation
  sbo status [id]                         Show one bulk operation (latest, if id omitted)
  sbo wait <id>                           Poll an operation until it finishes
  sbo download <url> [--out file]         Download a completed operation's JSONL result
  sbo cancel <id>                         Cancel a running bulk operation
  sbo --help                              Show this help
  sbo --version                           Show the installed version

Auth (env vars, or the equivalent flags):
  SHOPIFY_STORE_DOMAIN         e.g. my-store.myshopify.com   (--shop)
  SHOPIFY_ADMIN_ACCESS_TOKEN   Admin API access token        (--access-token)
  SHOPIFY_API_VERSION          optional, defaults to 2026-04 (--api-version)

Options:
  --wait                 run-query/run-mutation: poll until the operation finishes
  --out <file>           write result/output to a file instead of stdout

Examples:
  sbo run-query queries/all-product-titles.graphql --wait
  sbo run-mutation mutations/tag-add.graphql vars.jsonl --wait
  sbo status
  sbo wait gid://shopify/BulkOperation/123456789
  sbo download "https://storage.googleapis.com/..." --out result.jsonl
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = camelCase(arg.slice(2));
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, positional, options };
}

function camelCase(kebab) {
  return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function resolveClient(options) {
  const shop = options.shop || process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = options.accessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const apiVersion = options.apiVersion || process.env.SHOPIFY_API_VERSION || undefined;

  if (!shop || !accessToken) {
    throw new Error(
      'Missing credentials. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN ' +
        '(or pass --shop / --access-token). See README "Getting an access token".'
    );
  }

  return new ShopifyGraphQLClient({ shop, accessToken, apiVersion });
}

function writeOutput(content, outPath) {
  if (outPath && typeof outPath === 'string') {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, content);
    process.stderr.write(`Wrote ${outPath}\n`);
  } else {
    process.stdout.write(content);
  }
}

async function runRunQuery(positional, options) {
  const [queryFile] = positional;
  if (!queryFile) throw new Error('Usage: sbo run-query <file.graphql> [--wait]');
  const query = fs.readFileSync(path.resolve(queryFile), 'utf8');
  const client = resolveClient(options);

  if (options.wait) {
    const result = await runBulkQueryAndWait(client, query, { onPoll: (op) => process.stderr.write(`${describeBulkOperation(op)}\n`) });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = isSuccessStatus(result.status) ? 0 : 1;
    return;
  }

  const bulkOperation = await submitBulkQuery(client, query);
  process.stdout.write(JSON.stringify(bulkOperation, null, 2) + '\n');
  process.stderr.write(`Submitted. Poll it with: sbo wait ${bulkOperation.id}\n`);
}

async function runRunMutation(positional, options) {
  const [mutationFile, varsFile] = positional;
  if (!mutationFile || !varsFile) {
    throw new Error('Usage: sbo run-mutation <file.graphql> <vars.jsonl> [--wait]');
  }
  const mutation = fs.readFileSync(path.resolve(mutationFile), 'utf8');
  const jsonl = fs.readFileSync(path.resolve(varsFile), 'utf8');
  const client = resolveClient(options);
  const filename = path.basename(varsFile);

  if (options.wait) {
    const result = await runBulkMutationAndWait(client, mutation, jsonl, {
      filename,
      onPoll: (op) => process.stderr.write(`${describeBulkOperation(op)}\n`),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = isSuccessStatus(result.status) ? 0 : 1;
    return;
  }

  const bulkOperation = await stageAndSubmitBulkMutation(client, mutation, jsonl, { filename });
  process.stdout.write(JSON.stringify(bulkOperation, null, 2) + '\n');
  process.stderr.write(`Submitted. Poll it with: sbo wait ${bulkOperation.id}\n`);
}

async function runStatus(positional, options) {
  const [id] = positional;
  const client = resolveClient(options);

  if (id) {
    const result = await pollBulkOperation(client, id, { maxWaitMs: 0 });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  const [latest] = await fetchLatestBulkOperations(client, { first: 1 });
  process.stdout.write(JSON.stringify(latest || null, null, 2) + '\n');
}

async function runWait(positional, options) {
  const [id] = positional;
  if (!id) throw new Error('Usage: sbo wait <id>');
  const client = resolveClient(options);
  const result = await pollBulkOperation(client, id, {
    onPoll: (op) => process.stderr.write(`${describeBulkOperation(op)}\n`),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = isSuccessStatus(result.status) ? 0 : 1;
}

async function runDownload(positional, options) {
  const [url] = positional;
  if (!url) throw new Error('Usage: sbo download <url> [--out file]');
  const body = await downloadJsonl(url);
  writeOutput(body, options.out);
}

async function runCancel(positional, options) {
  const [id] = positional;
  if (!id) throw new Error('Usage: sbo cancel <id>');
  const client = resolveClient(options);
  const bulkOperation = await cancelBulkOperation(client, id);
  process.stdout.write(JSON.stringify(bulkOperation, null, 2) + '\n');
}

async function main() {
  const { command, positional, options } = parseArgs(process.argv.slice(2));

  if (!command || options.help || command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return;
  }

  if (command === '--version') {
    const pkg = require('../package.json');
    process.stdout.write(pkg.version + '\n');
    return;
  }

  if (command === 'run-query') return runRunQuery(positional, options);
  if (command === 'run-mutation') return runRunMutation(positional, options);
  if (command === 'status') return runStatus(positional, options);
  if (command === 'wait') return runWait(positional, options);
  if (command === 'download') return runDownload(positional, options);
  if (command === 'cancel') return runCancel(positional, options);

  process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
  process.exitCode = 1;
}

main().catch((err) => {
  if (err instanceof ShopifyGraphQLError) {
    process.stderr.write(`Admin API error: ${err.message}\n`);
  } else {
    process.stderr.write(`Error: ${err.message}\n`);
  }
  process.exitCode = 1;
});
