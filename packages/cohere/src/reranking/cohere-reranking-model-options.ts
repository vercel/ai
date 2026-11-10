import {
  lazySchema,
  zodSchema,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { CohereModelIds } from '../cohere-model-catalog';

// https://docs.cohere.com/docs/rerank
export type CohereRerankingModelId =
  | CohereModelIds['reranking']
  | (string & {});

export type CohereRerankingModelOptions = {
  /**
   * Long documents will be automatically truncated to the specified number of tokens.
   *
   * @default 4096
   */
  maxTokensPerDoc?: number;

  /**
   * The priority of the request.
   *
   * @default 0
   */
  priority?: number;
};

export const cohereRerankingModelOptionsSchema: FlexibleSchema<CohereRerankingModelOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        maxTokensPerDoc: z.number().optional(),
        priority: z.number().optional(),
      }),
    ),
  );
