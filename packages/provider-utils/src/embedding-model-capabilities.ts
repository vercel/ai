/**
 * Symbol for exposing the UTF-8 input byte budget of an embedding model.
 *
 * This capability is experimental and intentionally lives outside the versioned
 * embedding model specification.
 */
export const EMBEDDING_MODEL_MAX_INPUT_BYTES_PER_CALL = Symbol.for(
  'vercel.ai.embeddingModel.maxInputBytesPerCall',
);
