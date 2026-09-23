import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4.20-non-reasoning'
  | 'grok-4.20-reasoning'
  | 'grok-4.3'
  | 'grok-4.5'
  | 'grok-4.6'
  | 'grok-4.7'
  | 'grok-latest'
  | (string & {});

/**
 * @see https://docs.x.ai/docs/api-reference#create-new-response
 */
export const xaiLanguageModelResponsesOptions = z.object({
  /**
   * Constrains how hard a reasoning model thinks before responding.
   * Possible values are `none` (disables reasoning entirely; supported by
   * `grok-4.3` and newer reasoning models), `low` (uses fewer reasoning
   * tokens), `medium`, `high` (uses more reasoning tokens), and `xhigh`
   * (supported by `grok-4.6`).
   *
   * @see https://docs.x.ai/docs/guides/reasoning
   */
  reasoningEffort: z
    .enum(['none', 'low', 'medium', 'high', 'xhigh'])
    .optional(),
  logprobs: z.boolean().optional(),
  topLogprobs: z.number().int().min(0).max(8).optional(),
  /** Min-p sampling threshold between 0 and 1. */
  minP: z.number().min(0).max(1).optional(),
  /** Maximum number of agentic tool-calling turns. */
  maxTurns: z.number().int().optional(),
  /** Whether the model may call tools in parallel. @default true */
  parallelToolCalls: z.boolean().optional(),
  /** Cache key used to route requests with shared prompt prefixes. */
  promptCacheKey: z.string().optional(),
  /** Stable identifier used to attribute policy violations to an end user. */
  safetyIdentifier: z.string().optional(),
  serviceTier: z.enum(['default', 'priority']).optional(),
  /**
   * Whether to store the input message(s) and model response for later retrieval.
   * Must be set to `false` for teams with Zero Data Retention (ZDR) enabled,
   * otherwise the API will return an error.
   * @default true
   */
  store: z.boolean().optional(),
  /**
   * The ID of the previous response from the model.
   */
  previousResponseId: z.string().optional(),
  /** A unique identifier for the end user, used for abuse monitoring. */
  user: z.string().optional(),
  /**
   * Specify additional output data to include in the model response.
   * Example values: 'file_search_call.results'.
   */
  include: z
    .array(
      z.enum([
        'file_search_call.results',
        'web_search_call.action.sources',
        'code_interpreter_call.outputs',
        'reasoning.encrypted_content',
        'no_inline_citations',
      ]),
    )
    .nullish(),
});

export type XaiLanguageModelResponsesOptions = z.infer<
  typeof xaiLanguageModelResponsesOptions
>;
