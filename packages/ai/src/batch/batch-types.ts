import type {
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4StartResult as BatchV4StartResult,
  Experimental_BatchV4Status as BatchV4Status,
  Experimental_BatchLanguageModelV4 as BatchLanguageModelV4,
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
import type {
  FinishReason,
  GlobalProviderModelId,
  ToolChoice,
} from '../types/language-model';
import type { ProviderMetadata } from '../types/provider-metadata';
import type { LanguageModelUsage } from '../types/usage';

/**
 * Language model input that can be used for durable batch processing.
 *
 * String model IDs are resolved through the global provider and checked for
 * batch support at runtime.
 */
export type BatchLanguageModel = GlobalProviderModelId | BatchLanguageModelV4;

/**
 * The persisted reference for a text batch.
 */
export type TextBatchReference = {
  readonly version: 1;
  readonly type: 'text';
  readonly id: string;
  readonly provider: string;
  readonly modelId: string;
};

/**
 * Persisted reference for any supported batch type.
 *
 * Additional modality-specific references can be added to this union.
 */
export type BatchReference = TextBatchReference;

/**
 * Serializable error information for a batch or batch item.
 */
export type BatchError = BatchV4Error;

/**
 * The latest normalized lifecycle status for a batch.
 */
export type BatchStatus = BatchV4Status;

/**
 * A text batch and its latest normalized lifecycle status.
 */
export type TextBatch = TextBatchReference & BatchStatus;

/**
 * One text generation request within a batch.
 */
export type TextBatchRequest = Prompt &
  LanguageModelCallOptions & {
    id: string;
    providerOptions?: ProviderOptions;
  };

type BatchRequestOptions = {
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  timeout?: number | { totalMs?: number };
};

/**
 * Options for starting a text batch.
 */
export type StartTextBatchOptions<TOOLS extends ToolSet = ToolSet> = {
  model: BatchLanguageModel;
  requests: ReadonlyArray<TextBatchRequest>;

  /**
   * Tools that the model can call for every request in the batch.
   *
   * Tool definitions are sent to the provider, but their `execute` functions
   * are never invoked by batch processing.
   */
  tools?: TOOLS;

  /**
   * The tool choice strategy. Default: 'auto'.
   */
  toolChoice?: ToolChoice<NoInfer<TOOLS>>;

  /**
   * Controls the order in which tools are sent to the provider. Tools not
   * listed are appended alphabetically.
   */
  toolOrder?: ToolOrder<TOOLS>;

  /**
   * Context used when resolving dynamic tool descriptions.
   */
  toolsContext?: InferToolSetContext<TOOLS>;

  providerOptions?: ProviderOptions;

  /**
   * URL that the provider should notify when the batch reaches a terminal
   * state. Providers that do not support completion webhooks return an
   * unsupported warning.
   */
  webhookUrl?: string;
} & BatchRequestOptions;

/**
 * The acknowledged text batch and warnings produced while starting it.
 */
export type StartTextBatchResult = TextBatch & {
  readonly warnings: BatchV4StartResult['warnings'];
};

/**
 * Options shared by batch status and result retrieval operations.
 */
export type BatchOperationOptions<TOOLS extends ToolSet = ToolSet> = {
  model: BatchLanguageModel;
  batch: BatchReference;

  /**
   * Definitions for client tools that were provided to `startTextBatch`.
   *
   * The definitions are used only to validate and normalize returned tool
   * calls. Their `execute` functions are never invoked.
   */
  tools?: TOOLS;

  providerOptions?: ProviderOptions;
  maxRetries?: number;
} & BatchRequestOptions;

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
