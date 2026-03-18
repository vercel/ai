import type { JSONValue } from '@ai-sdk/provider';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { ModelEventInfo } from '../generate-text/callback-events';
import type { Embedding, ProviderMetadata } from '../types';
import type { EmbeddingModelUsage } from '../types/usage';
import type { Warning } from '../types/warning';

/**
 * Event passed to the `onStart` callback for embed and embedMany operations.
 *
 * Called when the operation begins, before the embedding model is called.
 */
export interface EmbedOnStartEvent {
  /** Unique identifier for this embed call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type (e.g. 'ai.embed' or 'ai.embedMany'). */
  readonly operationId: string;

  /** The embedding model being used. */
  readonly model: ModelEventInfo;

  /** The value(s) being embedded. A string for embed, an array for embedMany. */
  readonly value: string | Array<string>;

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
 * Event passed to the `onFinish` callback for embed and embedMany operations.
 *
 * Called when the operation completes, after the embedding model returns.
 */
export interface EmbedOnFinishEvent {
  /** Unique identifier for this embed call, used to correlate events. */
  readonly callId: string;

  /** Identifies the operation type (e.g. 'ai.embed' or 'ai.embedMany'). */
  readonly operationId: string;

  /** The embedding model that was used. */
  readonly model: ModelEventInfo;

  /** The value(s) that were embedded. A string for embed, an array for embedMany. */
  readonly value: string | Array<string>;

  /** The resulting embedding(s). A single vector for embed, an array for embedMany. */
  readonly embedding: Embedding | Array<Embedding>;

  /** Token usage for the embedding operation. */
  readonly usage: EmbeddingModelUsage;

  /** Warnings from the embedding model, e.g. unsupported settings. */
  readonly warnings: Array<Warning>;

  /** Optional provider-specific metadata. */
  readonly providerMetadata: ProviderMetadata | undefined;

  /** Response data including headers and body. A single response for embed, an array for embedMany. */
  readonly response:
    | { headers?: Record<string, string>; body?: unknown }
    | Array<{ headers?: Record<string, string>; body?: unknown } | undefined>
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
