import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://api-docs.deepseek.com/api/create-response
export type DeepSeekResponsesModelId =
  | 'deepseek-flash'
  | 'deepseek-v4-pro'
  | (string & {});

export const deepseekLanguageModelResponsesOptions = lazySchema(() =>
  zodSchema(
    z.object({
      thinking: z
        .object({ type: z.enum(['enabled', 'disabled']).optional() })
        .optional(),
      reasoningEffort: z.enum(['low', 'high', 'max']).optional(),
      topLogprobs: z.number().int().min(0).max(20).optional(),
      userId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/, 'userId must match /^[a-zA-Z0-9_-]+$/')
        .max(512, 'userId must be at most 512 characters long')
        .optional(),
    }),
  ),
);

export type DeepSeekLanguageModelResponsesOptions = {
  /**
   * Controls whether thinking mode is enabled. Thinking is enabled by default.
   */
  thinking?: {
    type?: 'enabled' | 'disabled';
  };

  /**
   * Controls the thinking strength when thinking is enabled.
   */
  reasoningEffort?: 'low' | 'high' | 'max';

  /**
   * Number of most likely tokens to return at each token position (0 to 20).
   * Log probabilities are returned in `providerMetadata.deepseek.logprobs`.
   */
  topLogprobs?: number;

  /**
   * An opaque identifier for the end user. DeepSeek uses this identifier for
   * content-safety tracing and request isolation.
   *
   * Must contain only ASCII letters, numbers, underscores, and hyphens, and
   * must be at most 512 characters long.
   */
  userId?: string;
};
