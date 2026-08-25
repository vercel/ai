import { z } from 'zod/v4';

export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'kimi-k2.5'
  | 'kimi-k2.6'
  | 'kimi-k2.7-code'
  | 'kimi-k2.7-code-highspeed'
  | 'kimi-k3'
  | (string & {});

export type MoonshotAILanguageModelOptions = {
  /**
   * Reasoning effort for Kimi K3. Other models do not support this option.
   */
  reasoningEffort?: 'low' | 'high' | 'max';

  /**
   * Thinking configuration for Kimi K2.5, Kimi K2.6, and Kimi K2.7.
   *
   * Kimi K2.7 only supports `enabled`. Kimi K2.5 and Kimi K2.6 support both
   * `enabled` and `disabled`. Kimi K3 and Moonshot V1 do not support this
   * option.
   */
  thinking?: {
    type: 'enabled' | 'disabled';

    /**
     * @deprecated Moonshot does not support a thinking token budget. This
     * option is ignored and produces a warning.
     */
    budgetTokens?: number;
  };

  /**
   * Controls reasoning history handling. `preserved` maps to Preserved
   * Thinking on Kimi K2.6 and Kimi K2.7. Other values use the model default.
   */
  reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';

  /**
   * Used to cache responses for similar requests to optimize cache hit rates.
   * Typically a session or task id.
   */
  promptCacheKey?: string;

  /**
   * A stable identifier used to help Moonshot detect users violating usage
   * policies. Recommended to hash the username or email address.
   */
  safetyIdentifier?: string;
};

export const moonshotaiLanguageModelOptions = z.object({
  /**
   * Reasoning effort for Kimi K3.
   */
  reasoningEffort: z.enum(['low', 'high', 'max']).optional(),

  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      // Retained in the runtime schema for backwards compatibility. Moonshot
      // does not accept this field, so request serialization always omits it.
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

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

export type MoonshotAIModelCapabilities = {
  reasoningEffort: boolean;
  thinkingTypes: readonly ('enabled' | 'disabled')[];
  preservedThinking: boolean;
};

const NO_THINKING_CAPABILITIES: MoonshotAIModelCapabilities = {
  reasoningEffort: false,
  thinkingTypes: [],
  preservedThinking: false,
};

export function getMoonshotAIModelCapabilities(
  modelId: MoonshotAIChatModelId,
): MoonshotAIModelCapabilities {
  if (modelId === 'kimi-k3') {
    return {
      reasoningEffort: true,
      thinkingTypes: [],
      preservedThinking: false,
    };
  }

  if (modelId.startsWith('kimi-k2.7-code')) {
    return {
      reasoningEffort: false,
      thinkingTypes: ['enabled'],
      preservedThinking: true,
    };
  }

  if (modelId === 'kimi-k2.6') {
    return {
      reasoningEffort: false,
      thinkingTypes: ['enabled', 'disabled'],
      preservedThinking: true,
    };
  }

  if (modelId === 'kimi-k2.5') {
    return {
      reasoningEffort: false,
      thinkingTypes: ['enabled', 'disabled'],
      preservedThinking: false,
    };
  }

  return NO_THINKING_CAPABILITIES;
}
