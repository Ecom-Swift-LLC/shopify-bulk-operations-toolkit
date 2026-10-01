'use strict';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED']);

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function isSuccessStatus(status) {
  return status === 'COMPLETED';
}

/**
 * Human-readable one-liner for a finished (or failed) BulkOperation node,
 * for CLI output and logs.
 */
function describeBulkOperation(bulkOperation) {
  if (!bulkOperation) return 'No bulk operation found.';
  const { id, status, errorCode, objectCount, rootObjectCount, url, partialDataUrl } = bulkOperation;

  if (status === 'COMPLETED') {
    return `${id}: COMPLETED — ${objectCount} object(s) (${rootObjectCount} root) — ${url || 'no result data'}`;
  }
  if (status === 'FAILED') {
    const reason = errorCode ? ` (${errorCode})` : '';
    const partial = partialDataUrl ? ` — partial data: ${partialDataUrl}` : '';
    return `${id}: FAILED${reason}${partial}`;
  }
  if (status === 'CANCELED' || status === 'EXPIRED') {
    return `${id}: ${status}`;
  }
  return `${id}: ${status} — ${objectCount || 0} object(s) processed so far`;
}

module.exports = { isTerminalStatus, isSuccessStatus, describeBulkOperation, TERMINAL_STATUSES };
