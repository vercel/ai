import { z } from 'zod/v4';

// https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
export type BedrockChatModelId =
  | 'amazon.titan-tg1-large'
  | 'amazon.titan-text-express-v1'
  | 'anthropic.claude-v2'
  | 'anthropic.claude-v2:1'
  | 'anthropic.claude-instant-v1'
  | 'anthropic.claude-sonnet-4-20250514-v1:0'
  | 'anthropic.claude-opus-4-20250514-v1:0'
  | 'anthropic.claude-3-7-sonnet-20250219-v1:0'
  | 'anthropic.claude-3-5-sonnet-20240620-v1:0'
  | 'anthropic.claude-3-5-sonnet-20241022-v2:0'
  | 'anthropic.claude-3-5-haiku-20241022-v1:0'
  | 'anthropic.claude-3-sonnet-20240229-v1:0'
  | 'anthropic.claude-3-haiku-20240307-v1:0'
  | 'anthropic.claude-3-opus-20240229-v1:0'
  | 'cohere.command-text-v14'
  | 'cohere.command-light-text-v14'
  | 'cohere.command-r-v1:0'
  | 'cohere.command-r-plus-v1:0'
  | 'meta.llama3-70b-instruct-v1:0'
  | 'meta.llama3-8b-instruct-v1:0'
  | 'meta.llama3-1-405b-instruct-v1:0'
  | 'meta.llama3-1-70b-instruct-v1:0'
  | 'meta.llama3-1-8b-instruct-v1:0'
  | 'meta.llama3-2-11b-instruct-v1:0'
  | 'meta.llama3-2-1b-instruct-v1:0'
  | 'meta.llama3-2-3b-instruct-v1:0'
  | 'meta.llama3-2-90b-instruct-v1:0'
  | 'mistral.mistral-7b-instruct-v0:2'
  | 'mistral.mixtral-8x7b-instruct-v0:1'
  | 'mistral.mistral-large-2402-v1:0'
  | 'mistral.mistral-small-2402-v1:0'
  | 'amazon.titan-text-express-v1'
  | 'amazon.titan-text-lite-v1'
  | (string & {});

export const bedrockProviderOptions = z.object({
  /**
   * Additional inference parameters that the model supports,
   * beyond the base set of inference parameters that Converse
   * supports in the inferenceConfig field
   */
  additionalModelRequestFields: z.record(z.string(), z.any()).optional(),
  /**
   * A list of strings of beta headers used to indicate opt-in to a
   * particular set of beta features for Anthropic models.
   */
  anthropicBeta: z
    .array(
      z.union([
        z.literal('computer-use-2025-01-24'), // Compatible with Claude 3.7 Sonnet.
        z.literal('computer-use-2024-10-22'), // Compatible with Claude 3.5 Sonnet v2.
        z.literal('token-efficient-tools-2025-02-19'), // Compatible with Claude 3.7 Sonnet.
        z.literal('interleaved-thinking-2025-05-14'), // Compatible with Claude 4 models.
        z.literal('output-128k-2025-02-19'), // Compatible with Claude 3.7 Sonnet.
        z.literal('dev-full-thinking-2025-05-14'), // Compatible with Claude 4 models only.
      ]),
    )
    .optional(),
  reasoningConfig: z
    .object({
      type: z.union([z.literal('enabled'), z.literal('disabled')]).optional(),
      budgetTokens: z.number().optional(),
    })
    .optional(),
  guardrailConfig: z
    .object({
      guardrailIdentifier: z.string(),
      guardrailVersion: z.string(),
      trace: z.enum(['enabled', 'disabled']).optional(),
      streamProcessingMode: z.enum(['sync', 'async']).optional(),
    })
    .optional(),
});

export type BedrockProviderOptions = z.infer<typeof bedrockProviderOptions>;
