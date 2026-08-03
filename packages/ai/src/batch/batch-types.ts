import type {
  Experimental_BatchV4CreateResult as BatchV4CreateResult,
  Experimental_BatchV4Error as BatchV4Error,
  Experimental_BatchV4ItemResult as BatchV4ItemResult,
  Experimental_BatchV4Status as BatchV4Status,
} from '@ai-sdk/provider';
import type { ProviderOptions, ToolSet } from '@ai-sdk/provider-utils';
import type { ContentPart } from '../generate-text/content-part';
import type { TypedToolCall } from '../generate-text/tool-call';
import type { LanguageModelCallOptions } from '../prompt/language-model-call-options';
import type { Prompt } from '../prompt/prompt';
import type { RequestOptions } from '../prompt/request-options';
import type {
  FinishReason,
  LanguageModel,
  ToolChoice,
} from '../types/language-model';
import type { ProviderMetadata } from '../types/provider-metadata';
import type { LanguageModelUsage } from '../types/usage';

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
 * A text batch and its latest normalized lifecycle status.
 */
export type TextBatch = TextBatchReference & BatchV4Status;

/**
 * One text generation request within a batch.
 */
export type TextBatchRequest = Prompt &
  LanguageModelCallOptions & {
    id: string;
    tools?: ToolSet;
    toolChoice?: ToolChoice<ToolSet>;
    providerOptions?: ProviderOptions;
  };

/**
 * Options for creating a text batch.
 */
export type CreateTextBatchOptions = {
  model: LanguageModel;
  requests: ReadonlyArray<TextBatchRequest>;
  providerOptions?: ProviderOptions;
} & Omit<RequestOptions, 'maxRetries'>;

/**
 * The acknowledged text batch and warnings produced while creating it.
 */
export type CreateTextBatchResult = TextBatch & {
  readonly warnings: BatchV4CreateResult['warnings'];
};

/**
 * Options shared by batch status and result retrieval operations.
 */
export type BatchOperationOptions = {
  model: LanguageModel;
  batch: BatchReference;
  providerOptions?: ProviderOptions;
} & RequestOptions;

/**
 * A normalized result for a successful text batch item.
 */
export type TextBatchGenerationResult = {
  readonly content: Array<ContentPart<ToolSet>>;
  readonly text: string;
  readonly toolCalls: Array<TypedToolCall<ToolSet>>;
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
export type TextBatchItemResult = BatchV4ItemResult<TextBatchGenerationResult>;
