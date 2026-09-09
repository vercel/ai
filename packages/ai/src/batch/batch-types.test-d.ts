import type {
  Experimental_BatchV4 as BatchV4,
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
  Experimental_BatchV4OperationOptions as BatchV4OperationOptions,
  Experimental_BatchV4Request as BatchV4Request,
  Experimental_BatchV4Status as BatchV4Status,
  Experimental_TextBatchV4Request as TextBatchV4Request,
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
  experimental_startBatch as startBatch,
  type GatewayProviderMetadata,
  type Experimental_BatchError as BatchError,
  type Experimental_BatchProvider as BatchProvider,
  type Experimental_BatchReference as BatchReference,
  type Experimental_BatchStatus as BatchStatus,
  type Experimental_GetBatchResultsOptions as GetBatchResultsOptions,
  type Experimental_GetBatchStatusOptions as GetBatchStatusOptions,
  type Experimental_StartBatchOptions as StartBatchOptions,
  type Experimental_StartBatchResult as StartBatchResult,
  type Experimental_Batch as Batch,
  type Experimental_TextBatchGenerationResult as TextBatchGenerationResult,
  type Experimental_TextBatchItemResult as TextBatchItemResult,
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

it('uses a modality-independent batch reference', () => {
  expectTypeOf<Batch>().toMatchTypeOf<BatchReference>();
  expectTypeOf<
    GetBatchStatusOptions['batch']
  >().toEqualTypeOf<BatchReference>();
});

it('keeps batch start non-retrying', () => {
  expectTypeOf<'maxRetries'>().not.toMatchTypeOf<keyof StartBatchOptions>();
  expectTypeOf<StartBatchOptions['timeout']>().toEqualTypeOf<
    number | { totalMs?: number } | undefined
  >();
  expectTypeOf<StartBatchOptions['webhookUrl']>().toEqualTypeOf<
    string | undefined
  >();
});

it('keeps text-specific options on text batch requests', () => {
  expectTypeOf<TextBatchRequest['type']>().toEqualTypeOf<'text'>();
  expectTypeOf<TextBatchRequest['model']>().toEqualTypeOf<string>();
  expectTypeOf<TextBatchRequest['tools']>().toEqualTypeOf<
    ToolSet | undefined
  >();
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

  expectTypeOf<
    StartBatchOptions<typeof tools>['requests'][number]['tools']
  >().toEqualTypeOf<typeof tools | undefined>();
  expectTypeOf<GetBatchResultsOptions<typeof tools>['tools']>().toEqualTypeOf<
    typeof tools | undefined
  >();
  expectTypeOf<'tools'>().not.toMatchTypeOf<keyof GetBatchStatusOptions>();
});

it('only exposes text-generation call options to batch providers', () => {
  type BatchCallOptions = TextBatchV4Request['options'];
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
    'id' | 'type' | 'modelId' | 'options'
  >();
  expectTypeOf<TextBatchV4Request<'model-a'>>().toEqualTypeOf<
    BatchV4Request<{ text: 'model-a' }>
  >();
  expectTypeOf<BatchCallOptions>().toEqualTypeOf<ExpectedBatchCallOptions>();
  expectTypeOf<
    Extract<
      keyof BatchCallOptions,
      'includeRawChunks' | 'abortSignal' | 'headers'
    >
  >().toEqualTypeOf<never>();
  expectTypeOf<
    TextBatchV4Request<'model-a'>['modelId']
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
  type TestProvider = ProviderV4 & { experimental_batch(): TestBatchApi };

  expectTypeOf<TestBatchApi>().toMatchTypeOf<BatchProvider>();
  expectTypeOf<TestProvider>().toMatchTypeOf<BatchProvider>();
  expectTypeOf<LanguageModelV4>().not.toMatchTypeOf<BatchProvider>();
  expectTypeOf<'type'>().not.toMatchTypeOf<keyof BatchV4OperationOptions>();
  expectTypeOf<
    Parameters<TestBatchApi['doGetBatchResults']>[0]
  >().toEqualTypeOf<BatchV4OperationOptions>();
  expectTypeOf<
    StartBatchOptions<ToolSet, TestProvider>['provider']
  >().toEqualTypeOf<TestProvider | undefined>();
  expectTypeOf<
    StartBatchOptions<ToolSet, TestProvider>['requests'][number]['model']
  >().toEqualTypeOf<ModelId>();
  expectTypeOf<GetBatchStatusOptions['provider']>().toEqualTypeOf<
    BatchProvider | undefined
  >();
  expectTypeOf<BatchV4Status['status']>().toEqualTypeOf<
    'pending' | 'completed' | 'failed'
  >();
  expectTypeOf<ReturnType<TestBatchApi['doGetBatchResults']>>().toEqualTypeOf<
    PromiseLike<ReadableStream<BatchV4ItemResult>>
  >();
  expectTypeOf<BatchV4ItemResult>().toEqualTypeOf<TextBatchV4ItemResult>();
  expectTypeOf<
    Extract<TextBatchV4ItemResult, { status: 'succeeded' }>['result']
  >().toEqualTypeOf<LanguageModelV4GenerateResult>();
  expectTypeOf<TextBatchV4ItemResult['type']>().toEqualTypeOf<'text'>();
  expectTypeOf<'type'>().not.toMatchTypeOf<keyof TextBatchItemResult>();
});

it('infers per-request model IDs from the provider batch service', () => {
  type TestProvider = ProviderV4 & {
    experimental_batch(): BatchV4<{
      text: 'model-a' | 'model-b';
      image: 'image-model';
    }>;
  };
  const provider = {} as TestProvider;

  startBatch({
    provider,
    requests: [
      { id: 'request-1', type: 'text', model: 'model-b', prompt: 'hello' },
    ],
  });

  startBatch({
    provider,
    requests: [
      {
        id: 'request-1',
        type: 'text',
        // @ts-expect-error request model ID is inferred from provider.experimental_batch()
        model: 'image-model',
        prompt: 'hello',
      },
    ],
  });
});

it('allows the default provider to be omitted', () => {
  startBatch({
    requests: [
      {
        id: 'request-1',
        type: 'text',
        model: 'anthropic/claude-sonnet-5',
        prompt: 'hello',
      },
    ],
  });

  getBatchStatus({ batch: {} as BatchReference });
  getBatchResults({ batch: {} as BatchReference });
});

it('exports the experimental batch functions with the public result types', () => {
  expectTypeOf(startBatch).returns.resolves.toEqualTypeOf<StartBatchResult>();
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
