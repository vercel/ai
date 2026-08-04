import type {
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
  Experimental_BatchV4Status as BatchV4Status,
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
  Experimental_LanguageModelV4BatchRequest as LanguageModelV4BatchRequest,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import {
  experimental_createTextBatch as createTextBatch,
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  type Experimental_BatchError as BatchError,
  type Experimental_BatchLanguageModel as BatchLanguageModel,
  type Experimental_BatchOperationOptions as BatchOperationOptions,
  type Experimental_BatchReference as BatchReference,
  type Experimental_BatchStatus as BatchStatus,
  type Experimental_CreateTextBatchOptions as CreateTextBatchOptions,
  type Experimental_CreateTextBatchResult as CreateTextBatchResult,
  type Experimental_TextBatch as TextBatch,
  type Experimental_TextBatchGenerationResult as TextBatchGenerationResult,
  type Experimental_TextBatchItemResult as TextBatchItemResult,
  type Experimental_TextBatchReference as TextBatchReference,
  type Experimental_TextBatchRequest as TextBatchRequest,
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

it('excludes Core orchestration and tool execution from batch items', () => {
  expectTypeOf<'tools'>().not.toMatchTypeOf<keyof TextBatchRequest>();
  expectTypeOf<'toolChoice'>().not.toMatchTypeOf<keyof TextBatchRequest>();
  expectTypeOf<'stopWhen'>().not.toMatchTypeOf<keyof TextBatchRequest>();
});

it('only exposes text-generation call options to batch providers', () => {
  type BatchCallOptions = LanguageModelV4BatchRequest['options'];
  type ExpectedBatchCallOptions = Pick<
    LanguageModelV4CallOptions,
    | 'prompt'
    | 'maxOutputTokens'
    | 'temperature'
    | 'stopSequences'
    | 'topP'
    | 'topK'
    | 'presencePenalty'
    | 'frequencyPenalty'
    | 'seed'
    | 'reasoning'
    | 'providerOptions'
  >;

  expectTypeOf<BatchCallOptions>().toEqualTypeOf<ExpectedBatchCallOptions>();
  expectTypeOf<
    Extract<
      keyof BatchCallOptions,
      | 'responseFormat'
      | 'tools'
      | 'toolChoice'
      | 'includeRawChunks'
      | 'abortSignal'
      | 'headers'
    >
  >().toEqualTypeOf<never>();
});

it('uses serializable response timestamps', () => {
  expectTypeOf<
    NonNullable<TextBatchGenerationResult['response']>['timestamp']
  >().toEqualTypeOf<string | undefined>();
});

it('reuses modality-neutral provider batch primitives', () => {
  expectTypeOf<BatchError>().toEqualTypeOf<BatchV4Error>();
  expectTypeOf<BatchStatus>().toEqualTypeOf<BatchV4Status>();
  expectTypeOf<TextBatchItemResult>().toEqualTypeOf<
    BatchV4ItemResult<TextBatchGenerationResult>
  >();
});

it('defines batch support as an experimental LanguageModelV4 capability', () => {
  expectTypeOf<BatchLanguageModelV4>().toMatchTypeOf<LanguageModelV4>();
  expectTypeOf<BatchLanguageModelV4>().toMatchTypeOf<BatchLanguageModel>();
  expectTypeOf<LanguageModelV4>().not.toMatchTypeOf<BatchLanguageModel>();
  expectTypeOf<
    CreateTextBatchOptions['model']
  >().toEqualTypeOf<BatchLanguageModel>();
  expectTypeOf<
    BatchOperationOptions['model']
  >().toEqualTypeOf<BatchLanguageModel>();
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
  expectTypeOf(getBatchStatus).returns.resolves.toEqualTypeOf<BatchStatus>();
  expectTypeOf(getBatchResults).returns.toEqualTypeOf<
    AsyncIterableStream<TextBatchItemResult>
  >();
});
