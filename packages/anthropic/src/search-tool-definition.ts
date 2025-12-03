import { SharedV3ProviderMetadata } from '@ai-sdk/provider';
import { AnthropicSearchToolType } from './anthropic-messages-options';

export interface AnthropicSearchToolDefinition {
  type: 'search-tool';
  name: string;
  query: string;
  maxResults?: number;
  searchType: AnthropicSearchToolType;
  deferLoading?: boolean;
  inputExamples?: unknown[];
  allowedCallers?: string[];
  providerOptions?: SharedV3ProviderMetadata;
}

export function createSearchToolDefinition(
  def: Omit<AnthropicSearchToolDefinition, 'type'>,
): AnthropicSearchToolDefinition {
  return { type: 'search-tool', ...def };
}
