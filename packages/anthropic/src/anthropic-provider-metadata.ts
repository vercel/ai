import type { Citation } from './anthropic-api';

/**
 * Citation metadata returned by Anthropic for generated text.
 */
export type AnthropicCitation = Citation;

/**
 * Anthropic provider metadata attached to generated text that contains
 * citations.
 */
export type AnthropicTextProviderMetadata = {
  anthropic: {
    citations: AnthropicCitation[];
  };
};
