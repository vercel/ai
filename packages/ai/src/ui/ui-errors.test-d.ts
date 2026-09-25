import { expectTypeOf, it } from 'vitest';
import {
  APICallError,
  EmptyResponseBodyError,
  InvalidArgumentError,
  UIMessageStreamError,
  UnsupportedFunctionalityError,
} from '..';

it('narrows exported UI error types with marker-based guards', () => {
  const error = undefined as unknown;

  if (APICallError.isInstance(error)) {
    expectTypeOf(error.statusCode).toEqualTypeOf<number | undefined>();
  }

  if (EmptyResponseBodyError.isInstance(error)) {
    expectTypeOf(error.message).toEqualTypeOf<string>();
  }

  if (InvalidArgumentError.isInstance(error)) {
    expectTypeOf(error.parameter).toEqualTypeOf<string>();
    expectTypeOf(error.value).toEqualTypeOf<unknown>();
  }

  if (UIMessageStreamError.isInstance(error)) {
    expectTypeOf(error.chunkType).toEqualTypeOf<string>();
    expectTypeOf(error.chunkId).toEqualTypeOf<string>();
  }

  if (UnsupportedFunctionalityError.isInstance(error)) {
    expectTypeOf(error.functionality).toEqualTypeOf<string>();
  }
});
