import { z } from 'zod/v4';

export type MoonshotAIChatModelId =
  | 'moonshot-v1-auto'
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'moonshot-v1-8k-vision-preview'
  | 'moonshot-v1-32k-vision-preview'
  | 'moonshot-v1-128k-vision-preview'
  | 'kimi-k2.5'
  | 'kimi-k2.6'
  | 'kimi-k2.7-code'
  | 'kimi-k2.7-code-highspeed'
  | 'kimi-k3'
  | (string & {});

export function isMoonshotAIKimiModel(modelId: MoonshotAIChatModelId): boolean {
  return getMoonshotAIModelFamily(modelId).startsWith('kimi-');
}

export type MoonshotAIModelFamily =
  | 'kimi-k2.5'
  | 'kimi-k2.6'
  | 'kimi-k2.7'
  | 'kimi-k3'
  | 'moonshot-v1'
  | 'unknown';

export function getMoonshotAIModelFamily(
  modelId: MoonshotAIChatModelId,
): MoonshotAIModelFamily {
  if (modelId === 'kimi-k2.5') return 'kimi-k2.5';
  if (modelId === 'kimi-k2.6') return 'kimi-k2.6';
  if (modelId === 'kimi-k2.7-code' || modelId === 'kimi-k2.7-code-highspeed') {
    return 'kimi-k2.7';
  }
  if (modelId === 'kimi-k3') return 'kimi-k3';
  if (modelId.startsWith('moonshot-v1-')) return 'moonshot-v1';
  return 'unknown';
}

export const moonshotaiLanguageModelOptions = z.object({
  /**
   * Reasoning effort for Kimi K3. Supports `low`, `high`, and `max`;
   * defaults to `max`.
   */
  reasoningEffort: z.enum(['low', 'high', 'max']).optional(),

  /**
   * Thinking configuration for Kimi K2.x models. Kimi K2.5 and K2.6 support
   * enabling or disabling thinking. Kimi K2.7 Code always has thinking
   * enabled.
   */
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
<<<<<<< HEAD
      /**
       * @deprecated Current hosted Kimi models do not document
       * `budget_tokens`. Retained for backwards compatibility with legacy or
       * custom Moonshot-compatible endpoints.
       */
=======
      // Accepted at runtime so existing callers receive a migration warning.
      // This field is intentionally excluded from the public type below.
>>>>>>> origin/main
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  /**
   * Controls how reasoning history is sent in multi-turn conversations.
   * `preserved` maps to `thinking.keep: 'all'` for supported Kimi K2.x
   * models. Kimi K3 uses Preserved Thinking by default.
   */
  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),

  /**
   * Used to cache responses for similar requests to optimize cache hit rates.
   * Typically a session or task id.
   */
  promptCacheKey: z.string().optional(),

  /**
   * A stable identifier used to help Moonshot detect users violating usage
   * policies. Recommended to hash the username or email address.
   */
  safetyIdentifier: z.string().optional(),
});

export type MoonshotAILanguageModelOptions = {
  /** Reasoning effort for Kimi K3. */
  reasoningEffort?: 'low' | 'high' | 'max';

  /** Controls thinking on Kimi K2.5 and K2.6. K2.7 is always enabled. */
  thinking?: {
    type?: 'enabled' | 'disabled';

    /**
     * @deprecated Moonshot Chat Completions does not support thinking budgets.
     * This value is ignored with a warning.
     */
    budgetTokens?: number;
  };

  reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
  promptCacheKey?: string;
  safetyIdentifier?: string;
};
