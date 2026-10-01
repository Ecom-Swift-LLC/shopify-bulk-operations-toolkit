'use strict';

/**
 * Parse one line of a Shopify bulk-operation JSONL result file. Returns
 * `null` for a blank line (trailing newline, stray whitespace) instead of
 * throwing, since every bulk-operation result file ends in one.
 */
function parseJsonlLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  return JSON.parse(trimmed);
}

/**
 * Parse a full JSONL string into an array of objects, skipping blank lines.
 */
function parseJsonl(text) {
  return text
    .split('\n')
    .map(parseJsonlLine)
    .filter((row) => row !== null);
}

/**
 * Re-nest a flat bulk-operation query result into parent/child groups by
 * Shopify's `__parentId` convention. Pass `groupObjects: true` on
 * bulkOperationRunQuery and you get this shape for free from Shopify
 * instead — this is for the (much more common) default flat JSONL, where
 * child rows interleave with their parents and only carry `__parentId`.
 *
 * Returns parent objects with each connection field named in
 * `childField(childTypename)` attached as an array, in file order.
 */
function groupBulkQueryResult(rows, childField) {
  const parentsById = new Map();
  const roots = [];

  for (const row of rows) {
    if (row.__parentId) continue;
    const { id } = row;
    const parent = { ...row };
    parentsById.set(id, parent);
    roots.push(parent);
  }

  for (const row of rows) {
    if (!row.__parentId) continue;
    const parent = parentsById.get(row.__parentId);
    if (!parent) continue;
    const fieldName = typeof childField === 'function' ? childField(row) : childField;
    if (!parent[fieldName]) parent[fieldName] = [];
    const { __parentId, ...child } = row;
    parent[fieldName].push(child);
  }

  return roots;
}

/**
 * Build the JSONL body for a bulk mutation's staged-upload input: one JSON
 * object per line, each line the `variables` for one execution of the
 * mutation passed to bulkOperationRunMutation.
 */
function buildMutationVariablesJsonl(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('records must be a non-empty array');
  }
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

module.exports = { parseJsonlLine, parseJsonl, groupBulkQueryResult, buildMutationVariablesJsonl };
