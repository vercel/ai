import { z } from 'zod/v4';

// https://platform.minimax.io/docs/api-reference/text-chat-anthropic
export type MiniMaxChatModelId =
  | 'minimax-m3.1-flash'
  | 'minimax-m3'
  | 'minimax-m2.7'
  | 'minimax-m2.7-highspeed'
  | 'minimax-m2.5'
  | 'minimax-m2.5-highspeed'
  | 'minimax-m2.1'
  | 'minimax-m2.1-highspeed'
  | 'minimax-m2'
  | (string & {});

export const minimaxLanguageModelOptions = z.object({
  /**
   * Reasoning effort for MiniMax M3.1 and later models. Higher levels can use more
   * reasoning tokens and increase latency. Defaults to the server's setting.
   */
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  thinking: z
    .object({
      type: z.enum(['adaptive', 'disabled']),
    })
    .optional(),
});

export type MiniMaxLanguageModelChatOptions = z.infer<
  typeof minimaxLanguageModelOptions
>;

export type MiniMaxLanguageModelOptions = MiniMaxLanguageModelChatOptions;

/** Cache options for M3.1 and later models system messages and text parts. */
export type MiniMaxCacheControlOptions = {
  /** Mark a stable prompt prefix for caching. A cache hit is not guaranteed. */
  cacheControl?: { type: 'ephemeral' };
};
