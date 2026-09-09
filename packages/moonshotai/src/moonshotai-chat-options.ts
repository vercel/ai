import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
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
   * Reasoning effort for Kimi K3. Supports `low`, `high`, and `max`;
   * defaults to `max`.
   */
  reasoningEffort: z.enum(['low', 'high', 'max']).optional(),

  /**
   * Static predicted content that can accelerate responses when much of the
   * output is known ahead of time.
   */
  prediction: z
    .object({
      type: z.literal('content'),
      content: z.union([
        z.string(),
        z.array(z.object({ type: z.literal('text'), text: z.string() })),
      ]),
    })
    .optional(),

  /**
   * Thinking configuration for Kimi K2.x models. Kimi K2.5 and K2.6 support
   * enabling or disabling thinking. Kimi K2.7 Code always has thinking
   * enabled.
   */
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      /**
       * @deprecated Moonshot Chat Completions does not support thinking
       * budgets. Accepted for backwards compatibility, then omitted with a
       * warning.
       */
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  /**
   * Controls preserved reasoning behavior in multi-turn conversations.
   * `disabled` and `interleaved` are compatibility values that leave the
   * request unchanged. `preserved` maps to `thinking.keep: 'all'` for Kimi
   * K2.6. Kimi K2.7 and K3 preserve reasoning by default.
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

  /**
   * Static predicted content that can accelerate responses when much of the
   * output is known ahead of time.
   */
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };

  /** Controls thinking on Kimi K2.5 and K2.6. K2.7 is always enabled. */
  thinking?: {
    type?: 'enabled' | 'disabled';

    /**
     * @deprecated Moonshot Chat Completions does not support thinking budgets.
     * This value is ignored with a warning.
     */
    budgetTokens?: number;
  };

  /**
   * Controls preserved reasoning behavior in multi-turn conversations.
   * `disabled` and `interleaved` are compatibility values that leave the
   * request unchanged. `preserved` maps to `thinking.keep: 'all'` for Kimi
   * K2.6. Kimi K2.7 and K3 preserve reasoning by default.
   */
  reasoningHistory?: 'disabled' | 'interleaved' | 'preserved';
  promptCacheKey?: string;
  safetyIdentifier?: string;
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

const moonshotaiDynamicToolSchema = z.object({
  type: z.literal('function'),
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional(),
});

export const moonshotaiAllMessageProviderOptions =
  moonshotaiAssistantMessageProviderOptions.extend({
    /** Function tools to load at this point in a Kimi K3 conversation. */
    tools: z.array(moonshotaiDynamicToolSchema).optional(),
  });

export type MoonshotAISystemMessageProviderOptions =
  MoonshotAIMessageProviderOptions & {
    /** Function tools to load at this point in a Kimi K3 conversation. */
    tools?: Array<
      Pick<
        LanguageModelV4FunctionTool,
        'type' | 'name' | 'description' | 'inputSchema' | 'strict'
      >
    >;
  };
