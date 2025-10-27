import { FlexibleSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type CohereRerankingModelId =
  | 'rerank-v3.5'
  | 'rerank-english-v3.0'
  | 'rerank-multilingual-v3.0'
  | 'rerank-english-v2.0'
  | 'rerank-multilingual-v2.0'
  | (string & {});

export type CohereRerankingOptions = {
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

export const cohereRerankingOptionsSchema: FlexibleSchema<CohereRerankingOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        maxTokensPerDoc: z.number().optional(),
        priority: z.number().optional(),
      }),
    ),
  );
