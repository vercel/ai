import type {
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
  Experimental_BatchV4Status as BatchV4Status,
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  LanguageModelV4GenerateResult,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import type {
  Experimental_BatchError as BatchError,
  Experimental_BatchOperationOptions as BatchOperationOptions,
  Experimental_BatchReference as BatchReference,
  Experimental_CreateTextBatchOptions as CreateTextBatchOptions,
  Experimental_TextBatch as TextBatch,
  Experimental_TextBatchGenerationResult as TextBatchGenerationResult,
  Experimental_TextBatchItemResult as TextBatchItemResult,
  Experimental_TextBatchReference as TextBatchReference,
} from '../index';

it('keeps text batch references as the current batch reference variant', () => {
  expectTypeOf<BatchReference>().toEqualTypeOf<TextBatchReference>();
  expectTypeOf<TextBatch>().toMatchTypeOf<BatchReference>();
  expectTypeOf<
    BatchOperationOptions['batch']
  >().toEqualTypeOf<BatchReference>();
});

it('keeps creation non-retrying', () => {
  expectTypeOf<'maxRetries'>().not.toMatchTypeOf<
    keyof CreateTextBatchOptions
  >();
});

it('uses serializable response timestamps', () => {
  expectTypeOf<
    NonNullable<TextBatchGenerationResult['response']>['timestamp']
  >().toEqualTypeOf<string | undefined>();
});

it('reuses modality-neutral provider batch primitives', () => {
  expectTypeOf<BatchError>().toEqualTypeOf<BatchV4Error>();
  expectTypeOf<TextBatchItemResult>().toEqualTypeOf<
    BatchV4ItemResult<TextBatchGenerationResult>
  >();
});

it('defines batch support as an experimental LanguageModelV4 capability', () => {
  expectTypeOf<BatchLanguageModelV4>().toMatchTypeOf<LanguageModelV4>();
  expectTypeOf<BatchV4Status['status']>().toEqualTypeOf<
    'pending' | 'completed' | 'failed'
  >();
  expectTypeOf<
    ReturnType<BatchLanguageModelV4['experimental_doGetBatchResults']>
  >().toEqualTypeOf<
    PromiseLike<
      ReadableStream<BatchV4ItemResult<LanguageModelV4GenerateResult>>
    >
  >();
});
