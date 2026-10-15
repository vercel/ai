// @ts-nocheck
import { APICallError, TypeValidationError } from 'ai';
import { NoSuchModelError } from '@ai-sdk/provider';
import { CustomError } from 'other-pkg';

if (APICallError.isAPICallError(error)) {
  console.log('API Call Error');
}

if (TypeValidationError.isTypeValidationError(error)) {
  console.log('Type Validation Error');
}

if (NoSuchModelError.isNoSuchModelError(error)) {
  console.log('No Such Model Error');
}

// Should not transform
if (CustomError.isCustomError(error)) {
  console.log('Custom Error');
}
