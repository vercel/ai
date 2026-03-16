import type { JSONValue } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { CallbackModelInfo } from '../generate-text/callback-events';
import type { Embedding, ProviderMetadata } from '../types';
import type { EmbeddingModelUsage } from '../types/usage';
import type { Warning } from '../types/warning';

/**
 * Event passed to the `onStart` callback for embed operations.
 *
 * Called when the embed operation begins, before the embedding model is called.
 */
export interface EmbedOnStartEvent {
  /** Unique identifier for this embed call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type. */
  readonly operationId: 'ai.embed';

  /** The embedding model being used. */
  readonly model: CallbackModelInfo;

  /** The value being embedded. */
  readonly value: string;

  /** Maximum number of retries for failed requests. */
  readonly maxRetries: number;

  /** Abort signal for cancelling the operation. */
  readonly abortSignal: AbortSignal | undefined;

  /** Additional HTTP headers sent with the request. */
  readonly headers: Record<string, string | undefined> | undefined;

  /** Additional provider-specific options. */
  readonly providerOptions: ProviderOptions | undefined;

  /** Whether telemetry is enabled. */
  readonly isEnabled: boolean | undefined;

  /** Whether to record inputs in telemetry. Enabled by default. */
  readonly recordInputs: boolean | undefined;

  /** Whether to record outputs in telemetry. Enabled by default. */
  readonly recordOutputs: boolean | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, JSONValue> | undefined;
}

/**
 * Event passed to the `onFinish` callback for embed operations.
 *
 * Called when the embed operation completes, after the embedding model returns.
 */
export interface EmbedOnFinishEvent {
  /** Unique identifier for this embed call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type. */
  readonly operationId: 'ai.embed';

  /** The embedding model that was used. */
  readonly model: CallbackModelInfo;

  /** The value that was embedded. */
  readonly value: string;

  /** The resulting embedding vector. */
  readonly embedding: Embedding;

  /** Token usage for the embedding operation. */
  readonly usage: EmbeddingModelUsage;

  /** Warnings from the embedding model, e.g. unsupported settings. */
  readonly warnings: Array<Warning>;

  /** Optional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Optional response data including headers and body. */
  readonly response:
    | { headers?: Record<string, string>; body?: unknown }
    | undefined;

  /** Whether telemetry is enabled. */
  readonly isEnabled: boolean | undefined;

  /** Whether to record inputs in telemetry. Enabled by default. */
  readonly recordInputs: boolean | undefined;

  /** Whether to record outputs in telemetry. Enabled by default. */
  readonly recordOutputs: boolean | undefined;

  /** Identifier from telemetry settings for grouping related operations. */
  readonly functionId: string | undefined;

  /** Additional metadata from telemetry settings. */
  readonly metadata: Record<string, JSONValue> | undefined;
}
