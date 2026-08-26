import { z } from 'zod/v4';

export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'moonshot-v1-auto'
  | 'moonshot-v1-8k-vision-preview'
  | 'moonshot-v1-32k-vision-preview'
  | 'moonshot-v1-128k-vision-preview'
  | 'kimi-k2'
  | 'kimi-k2-0905'
  | 'kimi-k2-thinking'
  | 'kimi-k2-thinking-turbo'
  | 'kimi-k2-turbo'
  | 'kimi-k2.5'
  | 'kimi-k3'
  | (string & {});

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

export function isMoonshotAIKimiModel(modelId: MoonshotAIChatModelId): boolean {
  return getMoonshotAIModelFamily(modelId).startsWith('kimi-');
}

export const moonshotaiProviderOptions = z.object({
  /**
   * Whether to use strict JSON schema validation for structured outputs.
   *
   * @default true
   */
  strictJsonSchema: z.boolean().optional(),

  /**
   * Whether to return log probabilities for generated tokens.
   */
  logprobs: z.boolean().optional(),

  /**
   * Number of most likely tokens to return at each token position.
   *
   * Setting this option automatically enables `logprobs`.
   */
  topLogprobs: z.number().int().min(0).max(20).optional(),

  /**
   * Reasoning effort for Kimi K3.
   */
  reasoningEffort: z.enum(['low', 'high', 'max']).optional(),

  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      // Accepted so existing callers receive a migration warning. It remains
      // in the public compatibility type below as a deprecated property.
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),
});

export type MoonshotAIProviderOptions = {
  /**
   * Whether to use strict JSON schema validation for structured outputs.
   *
   * @default true
   */
  strictJsonSchema?: boolean;

  /** Whether to return log probabilities for generated tokens. */
  logprobs?: boolean;

  /**
   * Number of most likely tokens to return at each token position.
   * Setting this option automatically enables `logprobs`.
   */
  topLogprobs?: number;

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
};

export const moonshotaiMessageProviderOptions = z.object({
  /**
   * The name of the participant represented by the message.
   *
   * Supported on system, user, and assistant messages.
   */
  name: z.string().optional(),
});

export type MoonshotAIMessageProviderOptions = z.infer<
  typeof moonshotaiMessageProviderOptions
>;

export const moonshotaiAssistantMessageProviderOptions =
  moonshotaiMessageProviderOptions.extend({
    /**
     * Whether the assistant message content is a partial response that Moonshot
     * should continue. Only supported on the final assistant message and cannot
     * be combined with JSON object response format.
     */
    partial: z.literal(true).optional(),
  });

export type MoonshotAIAssistantMessageProviderOptions = z.infer<
  typeof moonshotaiAssistantMessageProviderOptions
>;
