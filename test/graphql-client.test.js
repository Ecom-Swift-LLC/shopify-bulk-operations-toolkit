'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ShopifyGraphQLClient, ShopifyGraphQLError } = require('../src/graphql-client');

test('constructor requires shop and accessToken', () => {
  assert.throws(() => new ShopifyGraphQLClient({ accessToken: 'x' }), /shop is required/);
  assert.throws(() => new ShopifyGraphQLClient({ shop: 'x.myshopify.com' }), /accessToken is required/);
});

test('builds the versioned Admin API endpoint', () => {
  const client = new ShopifyGraphQLClient({
    shop: 'test.myshopify.com',
    accessToken: 'token',
    apiVersion: '2025-10',
  });
  assert.equal(client.endpoint, 'https://test.myshopify.com/admin/api/2025-10/graphql.json');
});

test('sends the access token header and JSON body', async () => {
  let capturedHeaders;
  let capturedBody;
  const client = new ShopifyGraphQLClient({
    shop: 'test.myshopify.com',
    accessToken: 'secret-token',
    fetchImpl: async (url, init) => {
      capturedHeaders = init.headers;
      capturedBody = JSON.parse(init.body);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({ data: { ok: true } }),
      };
    },
  });

  await client.request('query { shop { name } }', { first: 1 });
  assert.equal(capturedHeaders['X-Shopify-Access-Token'], 'secret-token');
  assert.deepEqual(capturedBody.variables, { first: 1 });
});

test('retries on HTTP 429 and eventually succeeds', async () => {
  let attempts = 0;
  const client = new ShopifyGraphQLClient({
    shop: 'test.myshopify.com',
    accessToken: 'token',
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        return { status: 429, ok: false, headers: { get: (h) => (h === 'Retry-After' ? '0' : null) } };
      }
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({ data: { orders: [] } }),
      };
    },
  });

  const { data } = await client.request('query { orders { nodes { id } } }');
  assert.equal(attempts, 3);
  assert.deepEqual(data, { orders: [] });
});

test('retries on a cost-throttled GraphQL error, then succeeds', async () => {
  let attempts = 0;
  const client = new ShopifyGraphQLClient({
    shop: 'test.myshopify.com',
    accessToken: 'token',
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          status: 200,
          ok: true,
          headers: { get: () => null },
          json: async () => ({
            errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
            extensions: { cost: { throttleStatus: { maximumAvailable: 100, restoreRate: 1000000 } } },
          }),
        };
      }
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({ data: { orders: [] } }),
      };
    },
  });

  const { data } = await client.request('query {}');
  assert.equal(attempts, 2);
  assert.deepEqual(data, { orders: [] });
});

test('throws ShopifyGraphQLError on a non-throttled GraphQL error', async () => {
  const client = new ShopifyGraphQLClient({
    shop: 'test.myshopify.com',
    accessToken: 'token',
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ errors: [{ message: 'Field does not exist' }] }),
    }),
  });

  await assert.rejects(() => client.request('query {}'), ShopifyGraphQLError);
});

test('throws ShopifyGraphQLError on a non-2xx HTTP response', async () => {
  const client = new ShopifyGraphQLClient({
    shop: 'test.myshopify.com',
    accessToken: 'bad-token',
    fetchImpl: async () => ({
      status: 401,
      ok: false,
      headers: { get: () => null },
      json: async () => ({ errors: [{ message: 'Unauthorized' }] }),
    }),
  });

  await assert.rejects(() => client.request('query {}'), (err) => {
    assert.ok(err instanceof ShopifyGraphQLError);
    assert.equal(err.status, 401);
    return true;
  });
});
