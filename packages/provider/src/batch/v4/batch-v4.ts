import type {
  SharedV4ProviderMetadata,
  SharedV4ProviderOptions,
  SharedV4Warning,
} from '../../shared';

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

/**
 * Options for starting a batch.
 */
export type BatchV4StartOptions<REQUEST> = {
  readonly requests: ReadonlyArray<REQUEST>;
  readonly providerOptions?: SharedV4ProviderOptions;
  readonly abortSignal?: AbortSignal;
  readonly headers?: Record<string, string | undefined>;
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
  readonly providerOptions?: SharedV4ProviderOptions;
  readonly abortSignal?: AbortSignal;
  readonly headers?: Record<string, string | undefined>;
};

/**
 * A complete terminal result for one request in a batch.
 */
export type BatchV4ItemResult<RESULT> =
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
 * Experimental structural capability for models that support durable batch
 * processing.
 */
export type BatchModelV4<REQUEST, RESULT> = {
  experimental_doStartBatch(
    options: BatchV4StartOptions<REQUEST>,
  ): PromiseLike<BatchV4StartResult>;

  experimental_doGetBatchStatus(
    options: BatchV4OperationOptions,
  ): PromiseLike<BatchV4Status>;

  experimental_doGetBatchResults(
    options: BatchV4OperationOptions,
  ): PromiseLike<ReadableStream<BatchV4ItemResult<RESULT>>>;
};
