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
  | 'anthropic.claude-opus-4-1-20250805-v1:0'
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
  | 'openai.gpt-oss-120b-1:0'
  | 'openai.gpt-oss-20b-1:0'
  | 'amazon.titan-text-express-v1'
  | 'amazon.titan-text-lite-v1'
  | 'us.amazon.nova-premier-v1:0'
  | 'us.amazon.nova-pro-v1:0'
  | 'us.amazon.nova-micro-v1:0'
  | 'us.amazon.nova-lite-v1:0'
  | 'us.anthropic.claude-3-sonnet-20240229-v1:0'
  | 'us.anthropic.claude-3-opus-20240229-v1:0'
  | 'us.anthropic.claude-3-haiku-20240307-v1:0'
  | 'us.anthropic.claude-3-5-sonnet-20240620-v1:0'
  | 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
  | 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
  | 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'
  | 'us.anthropic.claude-sonnet-4-20250514-v1:0'
  | 'us.anthropic.claude-opus-4-20250514-v1:0'
  | 'us.anthropic.claude-opus-4-1-20250805-v1:0'
  | 'us.meta.llama3-2-11b-instruct-v1:0'
  | 'us.meta.llama3-2-3b-instruct-v1:0'
  | 'us.meta.llama3-2-90b-instruct-v1:0'
  | 'us.meta.llama3-2-1b-instruct-v1:0'
  | 'us.meta.llama3-1-8b-instruct-v1:0'
  | 'us.meta.llama3-1-70b-instruct-v1:0'
  | 'us.meta.llama3-3-70b-instruct-v1:0'
  | 'us.deepseek.r1-v1:0'
  | 'us.mistral.pixtral-large-2502-v1:0'
  | 'us.meta.llama4-scout-17b-instruct-v1:0'
  | 'us.meta.llama4-maverick-17b-instruct-v1:0'
  | (string & {});

export const bedrockProviderOptions = z.object({
  /**
   * Additional inference parameters that the model supports,
   * beyond the base set of inference parameters that Converse
   * supports in the inferenceConfig field
   */
  additionalModelRequestFields: z.record(z.string(), z.any()).optional(),
  reasoningConfig: z
    .object({
      type: z.union([z.literal('enabled'), z.literal('disabled')]).optional(),
      budgetTokens: z.number().optional(),
    })
    .optional(),
});

export type BedrockProviderOptions = z.infer<typeof bedrockProviderOptions>;
