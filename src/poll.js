'use strict';

const { GET_BULK_OPERATION } = require('./queries');
const { isTerminalStatus } = require('./status');

const DEFAULT_MIN_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 15000;

/**
 * Exponential backoff with a cap, pure function: delay in ms before the
 * next poll, given how many polls have already happened (0-indexed).
 * Bulk operations commonly run for seconds to tens of minutes, so polling
 * every second from the start would waste calls — this ramps from 1s up to
 * a 15s ceiling instead of hammering the API or making the caller guess a
 * fixed interval.
 */
function pollBackoffDelay(attempt, { minDelayMs = DEFAULT_MIN_DELAY_MS, maxDelayMs = DEFAULT_MAX_DELAY_MS } = {}) {
  const delay = minDelayMs * 2 ** attempt;
  return Math.min(maxDelayMs, delay);
}

/**
 * Poll `bulkOperation(id)` until it reaches a terminal status
 * (COMPLETED / FAILED / CANCELED / EXPIRED), or until `maxWaitMs` elapses.
 *
 * @param {object} client - a ShopifyGraphQLClient (or anything with the
 *   same `.request(query, variables)` signature).
 * @param {string} id - the BulkOperation's GraphQL ID.
 * @param {object} [options]
 * @param {(bulkOperation: object) => void} [options.onPoll] - called with
 *   the raw `bulkOperation` node after every poll, terminal or not.
 * @param {number} [options.maxWaitMs] - give up (without erroring) after
 *   this many ms and return the last-seen state.
 * @param {(ms: number) => Promise<void>} [options.sleepImpl] - injectable
 *   for tests.
 * @returns {Promise<object>} the final `bulkOperation` node.
 */
async function pollBulkOperation(client, id, options = {}) {
  const { onPoll, maxWaitMs = Infinity, sleepImpl = defaultSleep } = options;
  const startedAt = Date.now();
  let attempt = 0;
  let last = null;

  while (true) {
    const { data } = await client.request(GET_BULK_OPERATION, { id });
    last = data.bulkOperation;
    if (onPoll) onPoll(last);

    if (!last || isTerminalStatus(last.status)) {
      return last;
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      return last;
    }

    await sleepImpl(pollBackoffDelay(attempt));
    attempt += 1;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { pollBackoffDelay, pollBulkOperation };
