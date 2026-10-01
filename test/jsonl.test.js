'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonlLine, parseJsonl, groupBulkQueryResult, buildMutationVariablesJsonl } = require('../src/jsonl');

test('parseJsonlLine parses a single JSON object', () => {
  assert.deepEqual(parseJsonlLine('{"id":"gid://shopify/Product/1","title":"Tee"}'), {
    id: 'gid://shopify/Product/1',
    title: 'Tee',
  });
});

test('parseJsonlLine returns null for blank/whitespace-only lines', () => {
  assert.equal(parseJsonlLine(''), null);
  assert.equal(parseJsonlLine('   \t  '), null);
  assert.equal(parseJsonlLine('\n'), null);
});

test('parseJsonl skips the trailing newline every bulk-operation file ends with', () => {
  const text = '{"id":"1"}\n{"id":"2"}\n';
  assert.deepEqual(parseJsonl(text), [{ id: '1' }, { id: '2' }]);
});

test('parseJsonl handles a file with no trailing newline', () => {
  const text = '{"id":"1"}\n{"id":"2"}';
  assert.deepEqual(parseJsonl(text), [{ id: '1' }, { id: '2' }]);
});

test('groupBulkQueryResult nests children under their parent by __parentId', () => {
  const rows = [
    { id: 'gid://shopify/Product/1', title: 'Tee' },
    { id: 'gid://shopify/ProductVariant/10', title: 'Small', __parentId: 'gid://shopify/Product/1' },
    { id: 'gid://shopify/ProductVariant/11', title: 'Large', __parentId: 'gid://shopify/Product/1' },
    { id: 'gid://shopify/Product/2', title: 'Hoodie' },
    { id: 'gid://shopify/ProductVariant/20', title: 'Only size', __parentId: 'gid://shopify/Product/2' },
  ];

  const grouped = groupBulkQueryResult(rows, 'variants');

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].title, 'Tee');
  assert.equal(grouped[0].variants.length, 2);
  assert.equal(grouped[0].variants[0].title, 'Small');
  assert.equal(grouped[0].variants[0].__parentId, undefined);
  assert.equal(grouped[1].variants.length, 1);
});

test('groupBulkQueryResult accepts a function to pick the child field by row shape', () => {
  const rows = [
    { id: 'gid://shopify/Order/1' },
    { id: 'gid://shopify/LineItem/10', __parentId: 'gid://shopify/Order/1', __typename: 'LineItem' },
  ];
  const grouped = groupBulkQueryResult(rows, (row) => (row.__typename === 'LineItem' ? 'lineItems' : 'children'));
  assert.equal(grouped[0].lineItems.length, 1);
});

test('groupBulkQueryResult drops orphaned children silently (parent outside this page)', () => {
  const rows = [{ id: 'gid://shopify/ProductVariant/99', __parentId: 'gid://shopify/Product/missing' }];
  assert.deepEqual(groupBulkQueryResult(rows, 'variants'), []);
});

test('buildMutationVariablesJsonl writes one JSON line per record with a trailing newline', () => {
  const jsonl = buildMutationVariablesJsonl([{ id: '1', tags: ['a'] }, { id: '2', tags: ['b'] }]);
  assert.equal(jsonl, '{"id":"1","tags":["a"]}\n{"id":"2","tags":["b"]}\n');
});

test('buildMutationVariablesJsonl rejects an empty or non-array input', () => {
  assert.throws(() => buildMutationVariablesJsonl([]), /non-empty array/);
  assert.throws(() => buildMutationVariablesJsonl(null), /non-empty array/);
});
