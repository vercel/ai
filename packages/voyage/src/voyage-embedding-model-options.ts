import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { VoyageModelIds } from './voyage-model-catalog';

export type VoyageEmbeddingModelId =
  | VoyageModelIds['embedding']
  | (string & {});

export const voyageEmbeddingModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      inputType: z.enum(['query', 'document']).nullable().optional(),
      truncation: z.boolean().optional(),
      outputDimension: z.number().optional(),
      outputDtype: z
        .enum(['float', 'int8', 'uint8', 'binary', 'ubinary'])
        .optional(),
    }),
  ),
);

export type VoyageEmbeddingModelOptions = InferSchema<
  typeof voyageEmbeddingModelOptions
>;
