import { normalizeClaudeModelId } from '@ai-sdk/anthropic/internal';
import { defineModelCapabilities } from '@ai-sdk/provider-utils';

/**
 * Features that Amazon Bedrock accepts for a model. These are separate from
 * the capabilities of the model itself, because Bedrock validates its own
 * request schema.
 */
export type AmazonBedrockModelCapabilities = {
  /**
   * Accepts native structured output (`output_config.format`).
   */
  nativeStructuredOutput: boolean;

  /**
   * Accepts strict tools.
   */
  strictTools: boolean;
};

const accepted: AmazonBedrockModelCapabilities = {
  nativeStructuredOutput: true,
  strictTools: true,
};

export const amazonBedrockModelCapabilities =
  defineModelCapabilities<AmazonBedrockModelCapabilities>({
    normalize: normalizeClaudeModelId,
    entries: [
      {
        match: [
          'claude-opus-4',
          'claude-sonnet-4',
          'claude-opus-4-1',
          'claude-opus-4-5',
          'claude-opus-4-6',
          'claude-sonnet-4-5',
        ],
        capabilities: accepted,
      },
      {
        match: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
        capabilities: { nativeStructuredOutput: false, strictTools: true },
      },
      { match: /^claude-(?:instant|v?2|3)(?=[-.:]|$)/, capabilities: accepted },
    ],
    fallback: modelId =>
      // Newer Claude generations currently reject native structured output
      // and strict tools on Bedrock. Non-Claude models and opaque inference
      // profile IDs keep their existing behavior.
      modelId.includes('claude-')
        ? { nativeStructuredOutput: false, strictTools: false }
        : accepted,
  });
