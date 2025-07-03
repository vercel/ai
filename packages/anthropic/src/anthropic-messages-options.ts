import { z } from 'zod/v4';

// https://docs.anthropic.com/claude/docs/models-overview
export type AnthropicMessagesModelId =
  | 'claude-4-opus-20250514'
  | 'claude-4-sonnet-20250514'
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

/**
 * Anthropic file part provider options for document-specific features.
 * These options apply to individual file parts (documents).
 */
export const anthropicFilePartProviderOptions = z.object({
  /**
   * Citation configuration for this document.
   * When enabled, this document will generate citations in the response.
   */
  citations: z
    .object({
      /**
       * Enable citations for this document
       */
      enabled: z.boolean(),
    })
    .optional(),

  /**
   * Custom title for the document.
   * If not provided, the filename will be used.
   */
  title: z.string().optional(),

  /**
   * Context about the document that will be passed to the model
   * but not used towards cited content.
   * Useful for storing document metadata as text or stringified JSON.
   */
  context: z.string().optional(),
});

export type AnthropicFilePartProviderOptions = z.infer<
  typeof anthropicFilePartProviderOptions
>;

export const anthropicProviderOptions = z.object({
  sendReasoning: z.boolean().optional(),

  thinking: z
    .object({
      type: z.union([z.literal('enabled'), z.literal('disabled')]),
      budgetTokens: z.number().optional(),
    })
    .optional(),
});

export type AnthropicProviderOptions = z.infer<typeof anthropicProviderOptions>;
