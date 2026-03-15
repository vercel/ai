import { z } from 'zod/v4';

// https://platform.minimax.io/docs/guides/text-generation
export type MiniMaxChatModelId =
  | 'MiniMax-M2'
  | 'MiniMax-M2-Stable'
  | 'MiniMax-M2.5'
  | 'MiniMax-M2.5-highspeed'
  | (string & {});

export const minimaxLanguageModelOptions = z.object({});

export type MiniMaxLanguageModelOptions = z.infer<
  typeof minimaxLanguageModelOptions
>;
