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
});

export type MiniMaxLanguageModelOptions = z.infer<
  typeof minimaxLanguageModelOptions
>;
