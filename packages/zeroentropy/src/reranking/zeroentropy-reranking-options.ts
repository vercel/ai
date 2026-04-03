import { FlexibleSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.zeroentropy.dev/api-reference/
export type ZeroEntropyRerankingModelId =
  | 'zerank-2'
  | 'zerank-2-nano'
  | 'zerank-1'
  | 'zerank-1-small'
  | (string & {});

export interface ZeroEntropyRerankingModelOptions {
  /**
   * Controls inference speed vs. throughput tradeoff.
   * - "fast": subsecond latency, lower rate limits
   * - "slow": >10s latency, higher rate limits
   */
  latency?: 'fast' | 'slow';
}

export const zeroEntropyRerankingModelOptionsSchema: FlexibleSchema<ZeroEntropyRerankingModelOptions> =
  lazySchema(() =>
    zodSchema(
      z.object({
        latency: z.enum(['fast', 'slow']).optional(),
      }),
    ),
  );
