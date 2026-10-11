import { expectTypeOf, it } from 'vitest';
import {
  ImageGenerationError,
  type GenerateImageCall,
  type GeneratedFile,
  type ImageGenerationFailedCall,
} from '..';

it('exports ImageGenerationError with recoverable split call results', () => {
  const error = new ImageGenerationError({
    calls: [],
    failedCalls: [{ callIndex: 1, error: new Error('failed') }],
  });

  expectTypeOf(error.images).toEqualTypeOf<Array<GeneratedFile>>();
  expectTypeOf(error.calls).toEqualTypeOf<Array<GenerateImageCall>>();
  expectTypeOf(error.failedCalls).toEqualTypeOf<
    Array<ImageGenerationFailedCall>
  >();
  expectTypeOf(error.failedCalls[0].callIndex).toEqualTypeOf<number>();
  expectTypeOf(error.failedCalls[0].error).toEqualTypeOf<unknown>();
  expectTypeOf(ImageGenerationError.isInstance(error)).toEqualTypeOf<boolean>();
});
