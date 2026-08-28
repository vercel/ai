import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4.6'
  | 'grok-4.5'
  | 'grok-4-1'
  | 'grok-4-1-fast-reasoning'
  | 'grok-4-1-fast-non-reasoning'
  | 'grok-4'
  | 'grok-4-fast'
  | 'grok-4-fast-non-reasoning'
  | 'grok-4-fast-reasoning'
  | 'grok-4.20-0309-non-reasoning'
  | 'grok-4.20-0309-reasoning'
  | 'grok-4.20-multi-agent-0309'
  | (string & {});

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiResponsesProviderOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `low` (uses fewer reasoning tokens), `medium`, `high`
   * (uses more reasoning tokens), and `xhigh` (supported by `grok-4.6`).
   * Defaults to `high` for models that support reasoning effort.
   */
  reasoningEffort: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
  /**
   * Whether to store the input message(s) and model response for later retrieval.
   * @default true
   */
  store: z.boolean().optional(),
  /**
   * The ID of the previous response from the model.
   */
  previousResponseId: z.string().optional(),
});

export type XaiResponsesProviderOptions = z.infer<
  typeof xaiResponsesProviderOptions
>;
