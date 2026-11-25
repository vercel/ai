import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AmazonBedrockModelIds } from './amazon-bedrock-model-catalog';

// https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
export type AmazonBedrockChatModelId =
  | AmazonBedrockModelIds['language']
  | (string & {});

export type AmazonBedrockChatModelSettings = {
  /**
   * The chat model family.
   *
   * Specify this when the model ID does not identify the underlying model,
   * such as an application inference profile ARN.
   */
  modelFamily?: 'anthropic';
};

/**
 * Bedrock file part provider options for document-specific features.
 * These options apply to individual file parts (documents).
 */
export const amazonBedrockFilePartProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
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
    }),
  ),
);

export type AmazonBedrockFilePartProviderOptions = InferSchema<
  typeof amazonBedrockFilePartProviderOptions
>;

/**
 * Amazon Bedrock text part provider options for guardrail content.
 * These options apply to individual text parts.
 */
export const amazonBedrockTextPartProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      guardContent: z.boolean().optional(),
      guardContentQualifiers: z
        .array(z.enum(['grounding_source', 'query', 'guard_content']))
        .optional(),
    }),
  ),
);

export type AmazonBedrockTextPartProviderOptions = InferSchema<
  typeof amazonBedrockTextPartProviderOptions
>;

/**
 * Amazon Bedrock image part provider options for guardrail content.
 * These options apply to individual image parts.
 */
export const amazonBedrockImagePartProviderOptions = lazySchema(() =>
  zodSchema(
    z.object({
      guardContent: z.boolean().optional(),
    }),
  ),
);

export type AmazonBedrockImagePartProviderOptions = InferSchema<
  typeof amazonBedrockImagePartProviderOptions
>;

export const amazonBedrockLanguageModelChatOptions = z.object({
  /**
   * Determines how structured outputs are generated for Anthropic models.
   *
   * - `outputFormat`: Use the native `output_config.format` parameter.
   * - `jsonTool`: Use a special 'json' tool to specify the structured output format.
   * - `auto`: Use `outputFormat` when supported, otherwise use `jsonTool` (default).
   */
  structuredOutputMode: z.enum(['outputFormat', 'jsonTool', 'auto']).optional(),
  /**
   * Additional inference parameters that the model supports,
   * beyond the base set of inference parameters that Converse
   * supports in the inferenceConfig field
   */
  additionalModelRequestFields: z.record(z.string(), z.any()).optional(),
  reasoningConfig: z
    .object({
      type: z
        .union([
          z.literal('enabled'),
          z.literal('disabled'),
          z.literal('adaptive'),
        ])
        .optional(),
      budgetTokens: z.number().optional(),
      maxReasoningEffort: z
        .enum(['low', 'medium', 'high', 'xhigh', 'max'])
        .optional(),
      display: z.enum(['omitted', 'summarized']).optional(),
    })
    .optional(),
  /**
   * Anthropic beta features to enable
   */
  anthropicBeta: z.array(z.string()).optional(),
  /**
   * Service tier for the request.
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
   *
   * - 'reserved': Uses provisioned throughput capacity
   * - 'priority': Prioritizes low-latency inference when capacity is available
   * - 'default': Standard on-demand tier
   * - 'flex': Lower-cost tier for flexible latency workloads
   */
  serviceTier: z.enum(['reserved', 'priority', 'default', 'flex']).optional(),
  /**
   * Key-value pairs to attach to the request for invocation log filtering and
   * cost attribution.
   * @see https://docs.aws.amazon.com/bedrock/latest/userguide/cost-mgmt-request-metadata.html
   *
   * - Maximum 16 entries per request.
   * - Keys and values: maximum 256 characters each.
   */
  requestMetadata: z.record(z.string(), z.string()).optional(),
});

export type AmazonBedrockLanguageModelChatOptions = z.infer<
  typeof amazonBedrockLanguageModelChatOptions
>;
