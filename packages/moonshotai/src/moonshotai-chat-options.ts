import { z } from 'zod/v4';

// https://platform.moonshot.cn/docs/api-reference
export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k' // Standard 8K context
  | 'moonshot-v1-32k' // Extended 32K context
  | 'moonshot-v1-128k' // Long 128K context
  | 'kimi-k2' // K2 base model
  | 'kimi-k2-0905' // K2 specific version
  | 'kimi-k2-thinking' // With reasoning
  | 'kimi-k2-thinking-turbo' // Fast reasoning
  | 'kimi-k2-turbo' // Fast inference
  | 'kimi-k2.5' // Latest multimodal
  | (string & {});

export const moonshotaiProviderOptions = z.object({
  thinking: z
    .object({
      type: z.enum(['enabled', 'disabled']).optional(),
      budgetTokens: z.number().int().min(1024).optional(),
    })
    .optional(),

  reasoningHistory: z.enum(['disabled', 'interleaved', 'preserved']).optional(),
});

export type MoonshotAIProviderOptions = z.infer<
  typeof moonshotaiProviderOptions
>;
