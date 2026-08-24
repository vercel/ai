import { z } from 'zod/v4';

// https://platform.minimax.io/docs/api-reference/text-chat-anthropic
export type MiniMaxChatModelId =
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
  thinking: z
    .object({
      type: z.enum(['adaptive', 'disabled']),
    })
    .optional(),

  /**
   * Request admission tier, sent as `service_tier`. `priority` ensures
   * priority admission at 1.5x the standard price; defaults to `standard`.
   *
   * Parsed by the underlying Anthropic-compatible language model; declared
   * here for typed `providerOptions.minimax` usage.
   */
  serviceTier: z.enum(['standard', 'priority']).optional(),
});

export type MiniMaxLanguageModelOptions = z.infer<
  typeof minimaxLanguageModelOptions
>;
