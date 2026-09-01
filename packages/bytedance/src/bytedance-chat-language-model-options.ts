import * as z4 from 'zod/v4';

export type { ByteDanceChatModelId } from './bytedance-chat-options';

export const bytedanceLanguageModelChatOptions = z4.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z4.string().optional(),

  /**
   * Whether to use strict JSON schema validation.
   * When true, the model uses constrained decoding to guarantee schema compliance.
   * Only used when the provider supports structured outputs and a schema is provided.
   *
   * @default true
   */
  strictJsonSchema: z4.boolean().optional(),

  /**
   * Whether to enable parallel function calling during tool use.
   */
  parallelToolCalls: z4.boolean().optional(),

  /**
   * Whether to return log probabilities of the output tokens or not.
   */
  logprobs: z4.boolean().optional(),

  /**
   * An integer between 0 and 20 specifying the number of most likely tokens to
   * return at each token position, each with an associated log probability.
   */
  topLogprobs: z4.number().int().min(0).max(20).optional(),

  /**
   * Modify the likelihood of specified tokens appearing in the completion.
   */
  logitBias: z4.record(z4.string(), z4.number().min(-100).max(100)).optional(),

  /**
   * Reasoning effort for reasoning models.
   */
  reasoningEffort: z4.enum(['minimal', 'low', 'medium', 'high']).optional(),

  /**
   * Thinking configuration for Ark models.
   */
  thinking: z4
    .object({
      type: z4.enum(['enabled', 'disabled', 'auto']),
    })
    .optional(),
});

export type ByteDanceLanguageModelChatOptions = z4.infer<
  typeof bytedanceLanguageModelChatOptions
>;
