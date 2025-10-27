import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const bedrockRerankingResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      results: z.array(
        z.object({
          document: z
            .object({
              textDocument: z
                .object({
                  text: z.string(),
                })
                .optional(),
              jsonDocument: z.any().optional(),
              type: z.string(),
            })
            .optional(),
          index: z.number(),
          relevanceScore: z.number(),
        }),
      ),
      nextToken: z.string().optional(),
    }),
  ),
);
