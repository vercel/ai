import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import * as z from 'zod/v4';

export type ParallelDecisionModelId = 'fast' | (string & {});

export const parallelDecisionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /** Include evidence excerpts in citations. Defaults to true. */
      includeExcerpts: z.boolean().optional(),
    }),
  ),
);

export type ParallelDecisionModelOptions = {
  /** Include evidence excerpts in citations. Defaults to true. */
  includeExcerpts?: boolean;
};

export type ParallelDecisionProviderMetadata = {
  /** Shared evidence for the whole request, without a per-answer mapping. */
  citations: Array<{
    url: string;
    title?: string | null;
    excerpts: string[];
  }>;
  confidence: Record<string, number>;
  decisionId: string;
  legend: Record<string, Record<string, string>>;
  mode: string;
};
