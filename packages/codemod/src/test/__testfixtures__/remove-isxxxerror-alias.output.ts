// @ts-nocheck
import { APICallError as APIError, RetryError } from 'ai';
import * as provider from '@ai-sdk/provider';
import { NoSuchToolError } from 'other-pkg';

// Aliased named import keeps its local name
if (APIError.isInstance(error)) {
  console.log('API Call Error');
}

// Namespace import keeps the namespace
if (provider.NoSuchModelError.isInstance(error)) {
  console.log('No Such Model Error');
}

// Regular import
const matches = RetryError.isInstance(error);

// Same method name on a class from another package is not an SDK error
if (NoSuchToolError.isNoSuchToolError(error)) {
  console.log('Not the SDK error');
}

// Same method name on a class declared in this file is not an SDK error
class JSONParseError {
  static isJSONParseError(value: unknown) {
    return value instanceof JSONParseError;
  }
}

if (JSONParseError.isJSONParseError(error)) {
  console.log('Local error');
}
