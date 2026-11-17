import {
  lazySchema,
  zodSchema,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { VoyageModelIds } from '../voyage-model-catalog';

export type VoyageRerankingModelId =
  | VoyageModelIds['reranking']
  | (string & {});

export type VoyageRerankingModelOptions = {
  returnDocuments?: boolean;
  truncation?: boolean;
};

export const voyageRerankingModelOptionsSchema: FlexibleSchema<VoyageRerankingModelOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        returnDocuments: z.boolean().optional(),
        truncation: z.boolean().optional(),
      }),
    ),
  );
