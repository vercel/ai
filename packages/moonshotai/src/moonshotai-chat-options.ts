import { z } from 'zod/v4';

export type MoonshotAIChatModelId =
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | 'kimi-k2'
  | 'kimi-k2-0905'
  | 'kimi-k2-thinking'
  | 'kimi-k2-thinking-turbo'
  | 'kimi-k2-turbo'
  | 'kimi-k2.5'
  | 'kimi-k3'
  | (string & {});

export function isMoonshotAIKimiModel(modelId: MoonshotAIChatModelId): boolean {
  return (
    modelId === 'kimi-k2.5' ||
    modelId === 'kimi-k2.6' ||
    modelId === 'kimi-k2.7-code' ||
    modelId === 'kimi-k2.7-code-highspeed' ||
    modelId === 'kimi-k3'
  );
}

export const moonshotaiProviderOptions = z.object({
  /**
   * Reasoning effort for Kimi K3. Currently, only `max` is supported.
   */
  reasoningEffort: z.literal('max').optional(),

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
