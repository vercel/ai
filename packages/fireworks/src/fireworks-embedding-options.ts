import { z } from 'zod/v4';
import type { FireworksModelIds } from './fireworks-model-catalog';

// Below is just a subset of the available models.
export type FireworksEmbeddingModelId =
  | FireworksModelIds['embedding']
  | (string & {});

export const fireworksEmbeddingModelOptions = z.object({});

export type FireworksEmbeddingModelOptions = z.infer<
  typeof fireworksEmbeddingModelOptions
>;
