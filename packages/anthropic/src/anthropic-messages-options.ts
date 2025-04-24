import { z } from 'zod';

// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-3-7-sonnet-20250219'
  | 'claude-3-5-sonnet-latest'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-5-haiku-latest'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-latest'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | (string & {});

export const anthropicProviderOptions = z.object({
  /**
Include reasoning content in requests sent to the model. Defaults to `true`.

If you are experiencing issues with the model handling requests involving
  */
  sendReasoning: z.boolean().optional(),

  thinking: z
    .object({
      type: z.union([z.literal('enabled'), z.literal('disabled')]),
      budgetTokens: z.number().optional(),
    })
    .optional(),
});

export type AnthropicProviderOptions = z.infer<typeof anthropicProviderOptions>;
