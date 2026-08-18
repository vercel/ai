import { z } from 'zod/v4';

export type PerplexityAgentModelId =
  | `perplexity/${string}`
  | `openai/${string}`
  | `anthropic/${string}`
  | `google/${string}`
  | `xai/${string}`
  | (string & {});

export type PerplexityAgentPreset =
  | 'fast'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

export const perplexityAgentOptions = z.looseObject({
  /**
   * ISO 639-1 language code for the response language.
   */
  language_preference: z.string().optional(),

  /**
   * Maximum number of agent research steps.
   */
  max_steps: z.number().int().min(1).max(100).optional(),

  /**
   * Model fallback chain. Takes precedence over the model passed to
   * `perplexity.responses`.
   */
  models: z.array(z.string()).min(1).max(5).optional(),

  /**
   * Continue a stored Agent API response.
   */
  previous_response_id: z.string().optional(),

  /**
   * Controls whether the response can be retrieved later.
   */
  store: z.boolean().optional(),
});

export type PerplexityLanguageModelAgentOptions = z.infer<
  typeof perplexityAgentOptions
>;

export type PerplexityAgentOptions = PerplexityLanguageModelAgentOptions;
