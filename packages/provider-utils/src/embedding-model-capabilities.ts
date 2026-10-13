import type { SharedV3ProviderOptions } from '@ai-sdk/provider';

/**
 * Symbol for exposing the UTF-8 input byte budget of an embedding model.
 *
 * This capability is experimental and intentionally lives outside the versioned
 * embedding model specification.
 */
export const EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL = Symbol.for(
  'vercel.ai.embeddingModel.maxInputBytesPerCall',
);

/**
 * Symbol for transforming provider options for an automatically batched
 * embedding model call.
 *
 * This capability is experimental and intentionally lives outside the versioned
 * embedding model specification.
 */
export const EMBEDDING_MODEL_PROVIDER_OPTIONS_TRANSFORMER = Symbol.for(
  'vercel.ai.embeddingModel.providerOptionsTransformer',
);

export type EmbeddingModelProviderOptionsTransformer = (options: {
  providerOptions: SharedV3ProviderOptions | undefined;
  values: Array<string>;
  startIndex: number;
  endIndex: number;
}) =>
  | SharedV3ProviderOptions
  | undefined
  | PromiseLike<SharedV3ProviderOptions | undefined>;
