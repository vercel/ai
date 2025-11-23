import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4'
  | 'grok-4-fast'
  | 'grok-4-fast-non-reasoning'
  | (string & {});

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiResponsesProviderOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `low` (uses fewer reasoning tokens), `medium` and `high` (uses more reasoning tokens).
   */
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
});

export type XaiResponsesProviderOptions = z.infer<
  typeof xaiResponsesProviderOptions
>;
