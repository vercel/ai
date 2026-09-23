import { AISDKError } from '@ai-sdk/provider';
import type {
  Embedding,
  EmbeddingModelUsage,
  ProviderMetadata,
} from '../types';

const name = 'AI_NoEmbeddingGeneratedError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export type EmbeddingModelResponseMetadata =
  | {
      headers?: Record<string, string>;
      body?: unknown;
    }
  | undefined;

/**
 * Thrown when an embedding model does not return exactly one embedding for
 * every requested value.
 */
export class NoEmbeddingGeneratedError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  /**
   * The values that were sent to the embedding model.
   */
  readonly values: Array<string>;

  /**
   * The embeddings that were returned by the embedding model.
   */
  readonly embeddings: Array<Embedding>;

  /**
   * The expected number of embeddings.
   */
  readonly expectedCount: number;

  /**
   * The number of embeddings returned by the model.
   */
  readonly actualCount: number;

  /**
   * Response data from the embedding model calls.
   */
  readonly responses: Array<EmbeddingModelResponseMetadata>;

  /**
   * Token usage reported by the embedding model.
   */
  readonly usage: EmbeddingModelUsage | undefined;

  /**
   * Provider-specific metadata reported by the embedding model.
   */
  readonly providerMetadata: ProviderMetadata | undefined;

  constructor({
    message,
    cause,
    values,
    embeddings,
    responses = [],
    usage,
    providerMetadata,
  }: {
    message?: string;
    cause?: unknown;
    values: Array<string>;
    embeddings: Array<Embedding>;
    responses?: Array<EmbeddingModelResponseMetadata>;
    usage?: EmbeddingModelUsage;
    providerMetadata?: ProviderMetadata;
  }) {
    super({
      name,
      message:
        message ??
        `No embeddings generated: expected ${values.length}, received ${embeddings.length}.`,
      cause,
    });

    this.values = values;
    this.embeddings = embeddings;
    this.expectedCount = values.length;
    this.actualCount = embeddings.length;
    this.responses = responses;
    this.usage = usage;
    this.providerMetadata = providerMetadata;
  }

  static isInstance(error: unknown): error is NoEmbeddingGeneratedError {
    return AISDKError.hasMarker(error, marker);
  }
}
