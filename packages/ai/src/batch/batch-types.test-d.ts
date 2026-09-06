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
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
  type GatewayProviderMetadata,
  type Experimental_BatchError as BatchError,
  type Experimental_BatchLanguageModel as BatchLanguageModel,
  type Experimental_BatchOperationOptions as BatchOperationOptions,
  type Experimental_BatchReference as BatchReference,
  type Experimental_BatchStatus as BatchStatus,
  type Experimental_StartTextBatchOptions as StartTextBatchOptions,
  type Experimental_StartTextBatchResult as StartTextBatchResult,
  type Experimental_TextBatch as TextBatch,
  type Experimental_TextBatchGenerationResult as TextBatchGenerationResult,
  type Experimental_TextBatchItemResult as TextBatchItemResult,
  type Experimental_TextBatchReference as TextBatchReference,
  type Experimental_TextBatchRequest as TextBatchRequest,
} from '../index';
import type { AsyncIterableStream } from '../util/async-iterable-stream';
import type { ContentPart } from '../generate-text/content-part';
import { jsonSchema, type ToolSet } from '@ai-sdk/provider-utils';

it('exposes typed Gateway async-job metadata', () => {
  expectTypeOf<
    NonNullable<GatewayProviderMetadata['asyncJob']>['webhookSigningSecret']
  >().toEqualTypeOf<string | undefined>();
});

it('keeps text batch references as the current batch reference variant', () => {
  expectTypeOf<BatchReference>().toEqualTypeOf<TextBatchReference>();
  expectTypeOf<TextBatch>().toMatchTypeOf<BatchReference>();
  expectTypeOf<
    BatchOperationOptions['batch']
  >().toEqualTypeOf<BatchReference>();
});

it('keeps batch start non-retrying', () => {
  expectTypeOf<'maxRetries'>().not.toMatchTypeOf<keyof StartTextBatchOptions>();
  expectTypeOf<StartTextBatchOptions['timeout']>().toEqualTypeOf<
    number | { totalMs?: number } | undefined
  >();
  expectTypeOf<StartTextBatchOptions['webhookUrl']>().toEqualTypeOf<
    string | undefined
  >();
});

it('excludes Core orchestration from batch items', () => {
  expectTypeOf<'tools'>().not.toMatchTypeOf<keyof TextBatchRequest>();
  expectTypeOf<'toolChoice'>().not.toMatchTypeOf<keyof TextBatchRequest>();
  expectTypeOf<'stopWhen'>().not.toMatchTypeOf<keyof TextBatchRequest>();
});

it('accepts shared definition-only tools when starting and reading a batch', () => {
  const tools = {
    weather: {
      inputSchema: jsonSchema({
        type: 'object',
        properties: { city: { type: 'string' } },
      }),
      execute: async () => ({ temperature: 20 }),
    },
  };

  expectTypeOf<StartTextBatchOptions<typeof tools>['tools']>().toEqualTypeOf<
    typeof tools | undefined
  >();
  expectTypeOf<BatchOperationOptions<typeof tools>['tools']>().toEqualTypeOf<
    typeof tools | undefined
  >();
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
    | 'responseFormat'
    | 'toolChoice'
    | 'tools'
    | 'providerOptions'
  >;

  expectTypeOf<BatchCallOptions>().toEqualTypeOf<ExpectedBatchCallOptions>();
  expectTypeOf<
    Extract<
      keyof BatchCallOptions,
      'includeRawChunks' | 'abortSignal' | 'headers'
    >
  >().toEqualTypeOf<never>();
});

it('uses serializable response timestamps', () => {
  expectTypeOf<
    NonNullable<TextBatchGenerationResult['response']>['timestamp']
  >().toEqualTypeOf<string | undefined>();
});

it('exposes Core content in successful batch results', () => {
  expectTypeOf<TextBatchGenerationResult['content']>().toEqualTypeOf<
    Array<ContentPart<ToolSet>>
  >();
});

it('flattens successful Core items while reusing provider status and errors', () => {
  expectTypeOf<BatchError>().toEqualTypeOf<BatchV4Error>();
  expectTypeOf<BatchStatus>().toEqualTypeOf<BatchV4Status>();
  type SucceededItem = Extract<TextBatchItemResult, { status: 'succeeded' }>;
  expectTypeOf<SucceededItem>().toEqualTypeOf<
    TextBatchGenerationResult & {
      readonly id: string;
      readonly status: 'succeeded';
    }
  >();
  expectTypeOf<'result'>().not.toMatchTypeOf<keyof SucceededItem>();
});

it('defines batch support as an experimental LanguageModelV4 capability', () => {
  expectTypeOf<BatchLanguageModelV4>().toMatchTypeOf<LanguageModelV4>();
  expectTypeOf<BatchLanguageModelV4>().toMatchTypeOf<BatchLanguageModel>();
  expectTypeOf<LanguageModelV4>().not.toMatchTypeOf<BatchLanguageModel>();
  expectTypeOf<
    StartTextBatchOptions['model']
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
    startTextBatch,
  ).returns.resolves.toEqualTypeOf<StartTextBatchResult>();
  expectTypeOf(getBatchStatus).returns.resolves.toEqualTypeOf<BatchStatus>();
  getBatchStatus({
    model: {} as BatchLanguageModelV4,
    batch: {} as BatchReference,
    // @ts-expect-error tools are only used when retrieving batch results
    tools: {},
  });
  expectTypeOf(getBatchResults).returns.toEqualTypeOf<
    AsyncIterableStream<TextBatchItemResult>
  >();
});
