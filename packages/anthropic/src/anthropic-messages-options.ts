import { z } from 'zod/v4';

// https://docs.claude.com/en/docs/about-claude/models/overview
export type AnthropicMessagesModelId =
  | 'claude-haiku-4-5'
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-5'
  | 'claude-sonnet-4-5-20250929'
  | 'claude-opus-4-1'
  | 'claude-opus-4-0'
  | 'claude-sonnet-4-0'
  | 'claude-opus-4-1-20250805'
  | 'claude-opus-4-20250514'
  | 'claude-sonnet-4-20250514'
  | 'claude-3-7-sonnet-latest'
  | 'claude-3-7-sonnet-20250219'
  | 'claude-3-5-haiku-latest'
  | 'claude-3-5-haiku-20241022'
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

  /**
   * Whether to disable parallel function calling during tool use. Default is false.
   * When set to true, Claude will use at most one tool per response.
   */
  disableParallelToolUse: z.boolean().optional(),

  /**
   * Cache control settings for this message.
   * See https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   */
  cacheControl: z
    .object({
      type: z.literal('ephemeral'),
      ttl: z.union([z.literal('5m'), z.literal('1h')]).optional(),
    })
    .optional(),

  mcpServers: z
    .array(
      z.object({
        type: z.literal('url'),
        name: z.string(),
        url: z.string(),
        authorizationToken: z.string().nullish(),
        toolConfiguration: z
          .object({
            enabled: z.boolean().nullish(),
            allowedTools: z.array(z.string()).nullish(),
          })
          .nullish(),
      }),
    )
    .optional(),

  /**
   * Agent Skills configuration. Skills enable Claude to perform specialized tasks
   * like document processing (PPTX, DOCX, PDF, XLSX) and data analysis.
   * Requires code execution tool to be enabled.
   */
  skills: z
    .array(
      z.object({
        type: z.union([z.literal('anthropic'), z.literal('custom')]),
        skill_id: z.string(),
        version: z.string().optional(),
      }),
    )
    .optional(),

  /**
   * Beta feature headers to enable experimental Anthropic API features.
   * For Skills, typically requires: 'code-execution-2025-08-25', 'skills-2025-10-02', 'files-api-2025-04-14'
   */
  betas: z.array(z.string()).optional(),
});

export type AnthropicProviderOptions = z.infer<typeof anthropicProviderOptions>;
