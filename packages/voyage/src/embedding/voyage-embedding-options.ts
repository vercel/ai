import { FlexibleSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.voyageai.com/docs/embeddings
export type VoyageEmbeddingModelId =
  | 'voyage-3.5'
  | 'voyage-3.5-lite'
  | 'voyage-3-large'
  | 'voyage-3'
  | 'voyage-3-lite'
  | 'voyage-code-3'
  | 'voyage-finance-2'
  | 'voyage-multilingual-2'
  | 'voyage-law-2'
  | 'voyage-code-2'
  | (string & {});

export type VoyageEmbeddingOptions = {
  /**
   * Specifies the type of input passed to the model.
   *
   * - `query`: The input is a search query. Voyage prepends a prompt optimized for retrieval.
   * - `document`: The input is a document to be stored in a vector database. Voyage prepends a prompt optimized for retrieval.
   * - If not specified, the embedding model directly converts the inputs into vectors.
   *
   * For retrieval/search use cases, it is recommended to use `query` or `document`.
   */
  inputType?: 'query' | 'document';

  /**
   * The number of dimensions for the resulting output embeddings.
   *
   * Supported values depend on the model:
   * - `voyage-3.5`, `voyage-3.5-lite`, `voyage-3-large`, `voyage-code-3`: 256, 512, 1024 (default), 2048
   *
   * If not specified, the model's default dimension is used.
   */
  outputDimension?: number;

  /**
   * The data type for the output embeddings.
   *
   * - `float`: 32-bit floating-point numbers (default, supported by all models)
   * - `int8`, `uint8`: 8-bit integer types (supported by newer models)
   * - `binary`, `ubinary`: Bit-packed single-bit values (supported by newer models)
   *
   * Note: The AI SDK currently only supports `float` embeddings.
   */
  outputDtype?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary';

  /**
   * Whether to truncate the input texts to fit within the model's context length.
   *
   * @default true
   */
  truncation?: boolean;
};

export const voyageEmbeddingOptionsSchema: FlexibleSchema<VoyageEmbeddingOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        inputType: z.enum(['query', 'document']).optional(),
        outputDimension: z.number().optional(),
        outputDtype: z
          .enum(['float', 'int8', 'uint8', 'binary', 'ubinary'])
          .optional(),
        truncation: z.boolean().optional(),
      }),
    ),
  );
