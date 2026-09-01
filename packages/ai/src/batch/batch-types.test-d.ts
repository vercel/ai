import type {
  Experimental_BatchV4 as BatchV4,
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
  Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  Experimental_BatchV4Request as BatchV4Request,
  Experimental_BatchV4Status as BatchV4Status,
  Experimental_LanguageModelV4BatchRequest as LanguageModelV4BatchRequest,
  Experimental_TextBatchV4ItemResult as TextBatchV4ItemResult,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  ProviderV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import {
  experimental_getBatchResults as getBatchResults,
  experimental_getBatchStatus as getBatchStatus,
  experimental_startTextBatch as startTextBatch,
  type GatewayProviderMetadata,
  type Experimental_BatchError as BatchError,
  type Experimental_BatchProvider as BatchProvider,
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
  expectTypeOf<TextBatchRequest['model']>().toEqualTypeOf<string | undefined>();
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

  expectTypeOf<keyof BatchV4Request>().toEqualTypeOf<
    'id' | 'modelId' | 'options'
  >();
  expectTypeOf<LanguageModelV4BatchRequest<'model-a'>>().toEqualTypeOf<
    BatchV4Request<'model-a', ExpectedBatchCallOptions>
  >();
  expectTypeOf<BatchCallOptions>().toEqualTypeOf<ExpectedBatchCallOptions>();
  expectTypeOf<
    Extract<
      keyof BatchCallOptions,
      'includeRawChunks' | 'abortSignal' | 'headers'
    >
  >().toEqualTypeOf<never>();
  expectTypeOf<
    LanguageModelV4BatchRequest<'model-a'>['modelId']
  >().toEqualTypeOf<'model-a'>();
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

it('defines batch support as a standalone provider service', () => {
  type ModelId = 'model-a' | 'model-b';
  interface TestBatchModelIds {
    text: ModelId;
    image: 'image-model';
  }
  type TestBatchApi = BatchV4<TestBatchModelIds>;
  type TestProvider = ProviderV4 & { batch(): TestBatchApi };

  expectTypeOf<TestBatchApi>().toMatchTypeOf<BatchProvider>();
  expectTypeOf<TestProvider>().toMatchTypeOf<BatchProvider>();
  expectTypeOf<LanguageModelV4>().not.toMatchTypeOf<BatchProvider>();
  expectTypeOf<ProviderV4['batch']>().toEqualTypeOf<
    (() => BatchV4) | undefined
  >();
  expectTypeOf<BatchV4OperationOptions['type']>().toEqualTypeOf<'text'>();
  expectTypeOf<
    Parameters<TestBatchApi['experimental_doGetBatchResults']>[0]
  >().toEqualTypeOf<BatchV4OperationOptions>();
  expectTypeOf<
    StartTextBatchOptions<ToolSet, TestProvider>['provider']
  >().toEqualTypeOf<TestProvider>();
  expectTypeOf<
    StartTextBatchOptions<ToolSet, TestProvider>['model']
  >().toEqualTypeOf<ModelId>();
  expectTypeOf<
    StartTextBatchOptions<ToolSet, TestProvider>['requests'][number]['model']
  >().toEqualTypeOf<ModelId | undefined>();
  expectTypeOf<
    BatchOperationOptions['provider']
  >().toEqualTypeOf<BatchProvider>();
  expectTypeOf<BatchV4Status['status']>().toEqualTypeOf<
    'pending' | 'completed' | 'failed'
  >();
  expectTypeOf<
    ReturnType<TestBatchApi['experimental_doGetBatchResults']>
  >().toEqualTypeOf<PromiseLike<ReadableStream<BatchV4ItemResult>>>();
  expectTypeOf<BatchV4ItemResult>().toEqualTypeOf<TextBatchV4ItemResult>();
  expectTypeOf<
    Extract<TextBatchV4ItemResult, { status: 'succeeded' }>['result']
  >().toEqualTypeOf<LanguageModelV4GenerateResult>();
  expectTypeOf<TextBatchV4ItemResult['type']>().toEqualTypeOf<'text'>();
  expectTypeOf<'type'>().not.toMatchTypeOf<keyof TextBatchItemResult>();
});

it('infers default and per-request model IDs from the provider batch service', () => {
  type TestProvider = ProviderV4 & {
    batch(): BatchV4<{
      text: 'model-a' | 'model-b';
      image: 'image-model';
    }>;
  };
  const provider = {} as TestProvider;

  startTextBatch({
    provider,
    model: 'model-a',
    requests: [{ id: 'request-1', model: 'model-b', prompt: 'hello' }],
  });

  startTextBatch({
    provider,
    // @ts-expect-error model ID is inferred from provider.batch()
    model: 'image-model',
    requests: [{ id: 'request-1', prompt: 'hello' }],
  });

  startTextBatch({
    provider,
    model: 'model-a',
    requests: [
      {
        id: 'request-1',
        // @ts-expect-error request model ID is inferred from provider.batch()
        model: 'image-model',
        prompt: 'hello',
      },
    ],
  });
});

it('exports the experimental batch functions with the public result types', () => {
  expectTypeOf(
    startTextBatch,
  ).returns.resolves.toEqualTypeOf<StartTextBatchResult>();
  expectTypeOf(getBatchStatus).returns.resolves.toEqualTypeOf<BatchStatus>();
  getBatchStatus({
    provider: {} as BatchV4,
    batch: {} as BatchReference,
    // @ts-expect-error tools are only used when retrieving batch results
    tools: {},
  });
  expectTypeOf(getBatchResults).returns.toEqualTypeOf<
    AsyncIterableStream<TextBatchItemResult>
  >();
});
