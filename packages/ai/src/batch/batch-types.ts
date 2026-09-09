import type {
  Experimental_BatchV4 as BatchV4,
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ModelIds as BatchV4ModelIds,
  Experimental_BatchV4StartResult as BatchV4StartResult,
  Experimental_BatchV4Status as BatchV4Status,
  ProviderV4,
} from '@ai-sdk/provider';
import type {
  InferToolSetContext,
  ProviderOptions,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { ContentPart } from '../generate-text/content-part';
import type { ToolOrder } from '../generate-text/tool-order';
import type { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import type { Prompt } from '../prompt/prompt';
import type { FinishReason, ToolChoice } from '../types/language-model';
import type { ProviderMetadata } from '../types/provider-metadata';
import type { LanguageModelUsage } from '../types/usage';

/**
 * Provider or lower-level batch interface used for batch processing.
 */
export type BatchProvider = ProviderV4 | BatchV4;

type InferBatchModelIds<PROVIDER extends BatchProvider> =
  PROVIDER extends BatchV4<infer MODEL_IDS>
    ? MODEL_IDS
    : PROVIDER extends { experimental_batch(): BatchV4<infer MODEL_IDS> }
      ? MODEL_IDS
      : BatchV4ModelIds;

/**
 * The persisted reference for a batch.
 */
export type BatchReference = {
  readonly version: 2;
  readonly id: string;
  readonly provider: string;
};

/**
 * Serializable error information for a batch or batch item.
 */
export type BatchError = BatchV4Error;

/**
 * The latest normalized lifecycle status for a batch.
 */
export type BatchStatus = BatchV4Status;

/**
 * A batch and its latest normalized lifecycle status.
 */
export type Batch = BatchReference & BatchStatus;

/**
 * One text generation request within a batch.
 */
export type TextBatchRequest<
  ModelId extends string = string,
  TOOLS extends ToolSet = ToolSet,
> = Prompt &
  LanguageModelCallOptions & {
    id: string;
    type: 'text';
    model: ModelId;
    tools?: TOOLS;
    toolChoice?: ToolChoice<NoInfer<TOOLS>>;
    toolOrder?: ToolOrder<TOOLS>;
    toolsContext?: InferToolSetContext<TOOLS>;
    providerOptions?: ProviderOptions;
  };

/**
 * One request within a batch, discriminated by modality.
 */
export type BatchRequest<
  ModelIds extends BatchV4ModelIds = BatchV4ModelIds,
  TOOLS extends ToolSet = ToolSet,
> = TextBatchRequest<ModelIds['text'], TOOLS>;

type BatchCallOptions = {
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  timeout?: number | { totalMs?: number };
};

/**
 * Options for starting a batch.
 */
export type StartBatchOptions<
  TOOLS extends ToolSet = ToolSet,
  PROVIDER extends BatchProvider = BatchProvider,
> = {
  /**
   * Provider used to process the batch. Defaults to the global provider, or
   * the Vercel AI Gateway when no global provider is configured.
   */
  provider?: PROVIDER;
  requests: ReadonlyArray<BatchRequest<InferBatchModelIds<PROVIDER>, TOOLS>>;

  providerOptions?: ProviderOptions;

  /**
   * URL that the provider should notify when the batch reaches a terminal
   * state. Providers that do not support completion webhooks return an
   * unsupported warning.
   */
  webhookUrl?: string;
} & BatchCallOptions;

/**
 * The acknowledged batch and warnings produced while starting it.
 */
export type StartBatchResult = Batch & {
  readonly warnings: BatchV4StartResult['warnings'];
};

/**
 * Options for retrieving batch status.
 */
export type GetBatchStatusOptions = {
  /**
   * Provider used to access the batch. Defaults to the global provider, or
   * the Vercel AI Gateway when no global provider is configured.
   */
  provider?: BatchProvider;
  batch: BatchReference;
  providerOptions?: ProviderOptions;
  maxRetries?: number;
} & BatchCallOptions;

/**
 * Options for retrieving batch results.
 */
export type GetBatchResultsOptions<TOOLS extends ToolSet = ToolSet> =
  GetBatchStatusOptions & {
    /**
     * Definitions for client tools that were provided to `startBatch` requests.
     *
     * The definitions are used only to validate and normalize returned tool
     * calls. Their `execute` functions are never invoked.
     */
    tools?: TOOLS;
  };

/**
 * A normalized result for a successful text batch item.
 */
export type TextBatchGenerationResult<TOOLS extends ToolSet = ToolSet> = {
  /** Ordered normalized content, including citations, sources, and tool data. */
  readonly content: Array<ContentPart<TOOLS>>;
  readonly text: string;
  readonly finishReason: FinishReason;
  readonly rawFinishReason?: string;
  readonly usage: LanguageModelUsage;
  readonly response?: {
    readonly id?: string;
    readonly timestamp?: string;
    readonly modelId?: string;
  };
  readonly providerMetadata?: ProviderMetadata;
};

/**
 * A complete terminal result for one request in a text batch.
 */
export type TextBatchItemResult<TOOLS extends ToolSet = ToolSet> =
  | (TextBatchGenerationResult<TOOLS> & {
      readonly id: string;
      readonly status: 'succeeded';
    })
  | {
      readonly id: string;
      readonly status: 'failed';
      readonly error: BatchError;
      readonly providerMetadata?: ProviderMetadata;
    }
  | {
      readonly id: string;
      readonly status: 'cancelled' | 'expired';
      readonly error?: BatchError;
      readonly providerMetadata?: ProviderMetadata;
    };

/**
 * A complete terminal result for one request in a batch.
 */
export type BatchItemResult<TOOLS extends ToolSet = ToolSet> =
  TextBatchItemResult<TOOLS>;
