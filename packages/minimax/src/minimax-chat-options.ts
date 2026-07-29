import { z } from 'zod/v4';

// https://platform.minimax.io/docs/api-reference/text-chat-openai
export type MiniMaxChatModelId =
  | 'MiniMax-M2'
  | 'MiniMax-M2.1'
  | 'MiniMax-M2.1-lightning'
  | 'MiniMax-M2.5'
  | 'MiniMax-M3'
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
