import type {
  SharedV4ProviderMetadata,
  SharedV4ProviderOptions,
  SharedV4Warning,
} from '../../shared';
import type { LanguageModelV4GenerateResult } from '../../language-model/v4/language-model-v4-generate-result';
import type { TextBatchV4Request } from './text-batch-v4-request';

/**
 * Model IDs accepted by each batch modality.
 *
 * Additional modality-specific model ID types can be added to this mapping.
 */
export type BatchV4ModelIds = {
  readonly text: string;
};

type BatchV4CallOptions = {
  readonly providerOptions?: SharedV4ProviderOptions;
  readonly abortSignal?: AbortSignal;
  readonly headers?: Record<string, string | undefined>;
};

type BatchV4StartCallOptions = BatchV4CallOptions & {
  /**
   * URL the provider notifies when the batch reaches a terminal state.
   * Providers that do not support completion webhooks should return an
   * unsupported warning.
   */
  readonly webhookUrl?: string;
};

/**
 * Serializable error information for a batch or batch item.
 */
export type BatchV4Error = {
  readonly message: string;
  readonly type?: string;
  readonly code?: string;
  readonly statusCode?: number;
};

/**
 * Normalized lifecycle status for a batch.
 */
export type BatchV4Status = {
  readonly status: 'pending' | 'completed' | 'failed';
  readonly rawStatus?: string;
  readonly requestCounts?: {
    readonly total: number;
    readonly pending: number;
    readonly completed: number;
    readonly failed: number;
  };
  readonly error?: BatchV4Error;
  readonly createdAt?: string;
  readonly expiresAt?: string;
  readonly providerMetadata?: SharedV4ProviderMetadata;
};

export type BatchV4Request<ModelIds extends BatchV4ModelIds = BatchV4ModelIds> =
  TextBatchV4Request<ModelIds['text']>;

/**
 * Options for starting a batch of requests discriminated by modality.
 *
 * Additional modality-specific request variants can be added to
 * `BatchV4Request`.
 */
export type BatchV4StartOptions<
  ModelIds extends BatchV4ModelIds = BatchV4ModelIds,
> = BatchV4StartCallOptions & {
  readonly requests: ReadonlyArray<BatchV4Request<ModelIds>>;
};

/**
 * Result of starting a batch.
 */
export type BatchV4StartResult = BatchV4Status & {
  readonly batchId: string;
  readonly warnings: Array<{
    readonly requestId?: string;
    readonly warning: SharedV4Warning;
  }>;
};

/**
 * Options for a batch status or results operation.
 */
export type BatchV4OperationOptions = {
  readonly batchId: string;
} & BatchV4CallOptions;

type BatchV4ItemResultBase<RESULT> =
  | {
      readonly id: string;
      readonly status: 'succeeded';
      readonly result: RESULT;
    }
  | {
      readonly id: string;
      readonly status: 'failed';
      readonly error: BatchV4Error;
      readonly providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      readonly id: string;
      readonly status: 'cancelled' | 'expired';
      readonly error?: BatchV4Error;
      readonly providerMetadata?: SharedV4ProviderMetadata;
    };

/**
 * A complete terminal result for one request in a text batch.
 */
export type TextBatchV4ItemResult = {
  readonly type: 'text';
} & BatchV4ItemResultBase<LanguageModelV4GenerateResult>;

/**
 * A complete terminal result for one request in a batch, discriminated by
 * modality.
 *
 * Additional modality-specific item results can be added to this union.
 */
export type BatchV4ItemResult = TextBatchV4ItemResult;

/**
 * Specification for a batch interface that implements batch interface version 4.
 */
export type BatchV4<ModelIds extends BatchV4ModelIds = BatchV4ModelIds> = {
  /**
   * The batch interface must specify which batch interface version it implements.
   */
  readonly specificationVersion: 'v4';

  /**
   * Provider ID.
   */
  readonly provider: string;

  /**
   * Supported URL patterns by media type for requests in this batch interface.
   */
  readonly supportedUrls:
    | PromiseLike<Record<string, RegExp[]>>
    | Record<string, RegExp[]>;

  doStartBatch(
    options: BatchV4StartOptions<ModelIds>,
  ): PromiseLike<BatchV4StartResult>;

  doGetBatchStatus(
    options: BatchV4OperationOptions,
  ): PromiseLike<BatchV4Status>;

  doGetBatchResults(
    options: BatchV4OperationOptions,
  ): PromiseLike<ReadableStream<BatchV4ItemResult>>;
};
