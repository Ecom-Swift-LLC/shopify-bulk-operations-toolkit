'use strict';

// Every operation below was validated against the live 2026-04 Admin GraphQL
// schema before this repo shipped. `currentBulkOperation` is deprecated in
// this API version in favor of the `bulkOperations` connection, which is why
// LATEST_BULK_OPERATIONS uses that instead.

const RUN_BULK_QUERY = `
mutation RunBulkQuery($query: String!) {
  bulkOperationRunQuery(query: $query) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

const RUN_BULK_MUTATION = `
mutation RunBulkMutation($mutation: String!, $stagedUploadPath: String!) {
  bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

const STAGED_UPLOADS_CREATE = `
mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

const GET_BULK_OPERATION = `
query GetBulkOperation($id: ID!) {
  bulkOperation(id: $id) {
    id
    status
    errorCode
    objectCount
    rootObjectCount
    url
    partialDataUrl
    type
  }
}
`;

const LATEST_BULK_OPERATIONS = `
query LatestBulkOperations($first: Int!) {
  bulkOperations(first: $first) {
    nodes {
      id
      status
      errorCode
      objectCount
      rootObjectCount
      url
      partialDataUrl
      type
      query
    }
  }
}
`;

const CANCEL_BULK_OPERATION = `
mutation CancelBulkOperation($id: ID!) {
  bulkOperationCancel(id: $id) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
`;

module.exports = {
  RUN_BULK_QUERY,
  RUN_BULK_MUTATION,
  STAGED_UPLOADS_CREATE,
  GET_BULK_OPERATION,
  LATEST_BULK_OPERATIONS,
  CANCEL_BULK_OPERATION,
};
