'use strict';

const { ShopifyGraphQLClient, ShopifyGraphQLError, DEFAULT_API_VERSION } = require('./graphql-client');
const { parseJsonlLine, parseJsonl, groupBulkQueryResult, buildMutationVariablesJsonl } = require('./jsonl');
const { isTerminalStatus, isSuccessStatus, describeBulkOperation } = require('./status');
const { pollBackoffDelay, pollBulkOperation } = require('./poll');
const { buildStagedUploadInput, extractStagedUploadPath, createStagedUpload, uploadToStagedTarget } = require('./staged-upload');
const { submitBulkQuery, runBulkQueryAndWait, cancelBulkOperation, downloadJsonl } = require('./bulk-query');
const { submitBulkMutation, stageAndSubmitBulkMutation, runBulkMutationAndWait } = require('./bulk-mutation');
const { fetchLatestBulkOperations } = require('./latest-bulk-operation');

module.exports = {
  ShopifyGraphQLClient,
  ShopifyGraphQLError,
  DEFAULT_API_VERSION,
  parseJsonlLine,
  parseJsonl,
  groupBulkQueryResult,
  buildMutationVariablesJsonl,
  isTerminalStatus,
  isSuccessStatus,
  describeBulkOperation,
  pollBackoffDelay,
  pollBulkOperation,
  buildStagedUploadInput,
  extractStagedUploadPath,
  createStagedUpload,
  uploadToStagedTarget,
  submitBulkQuery,
  runBulkQueryAndWait,
  cancelBulkOperation,
  downloadJsonl,
  submitBulkMutation,
  stageAndSubmitBulkMutation,
  runBulkMutationAndWait,
  fetchLatestBulkOperations,
};
