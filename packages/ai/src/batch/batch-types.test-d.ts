import type {
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
  Experimental_BatchV4Status as BatchV4Status,
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  LanguageModelV4GenerateResult,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import {
  experimental_createTextBatch as createTextBatch,
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  type Experimental_BatchError as BatchError,
  type Experimental_BatchOperationOptions as BatchOperationOptions,
  type Experimental_BatchReference as BatchReference,
  type Experimental_CreateTextBatchOptions as CreateTextBatchOptions,
  type Experimental_CreateTextBatchResult as CreateTextBatchResult,
  type Experimental_TextBatch as TextBatch,
  type Experimental_TextBatchGenerationResult as TextBatchGenerationResult,
  type Experimental_TextBatchItemResult as TextBatchItemResult,
  type Experimental_TextBatchReference as TextBatchReference,
} from '../index';
import type { AsyncIterableStream } from '../util/async-iterable-stream';

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
  expectTypeOf<CreateTextBatchOptions['timeout']>().toEqualTypeOf<
    number | { totalMs?: number } | undefined
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

it('exports the experimental batch functions with the public result types', () => {
  expectTypeOf(
    createTextBatch,
  ).returns.resolves.toEqualTypeOf<CreateTextBatchResult>();
  expectTypeOf(getBatchStatus).returns.resolves.toEqualTypeOf<TextBatch>();
  expectTypeOf(getBatchResults).returns.toEqualTypeOf<
    AsyncIterableStream<TextBatchItemResult>
  >();
});
