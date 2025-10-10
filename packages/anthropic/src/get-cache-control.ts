import { SharedV3ProviderMetadata } from '@ai-sdk/provider';
import { AnthropicCacheControl } from './anthropic-messages-api';

export function getCacheControl(
  providerMetadata: SharedV3ProviderMetadata | undefined,
): AnthropicCacheControl | undefined {
  const anthropic = providerMetadata?.anthropic;

  // allow both cacheControl and cache_control:
  const cacheControlValue = anthropic?.cacheControl ?? anthropic?.cache_control;

  // Pass through value assuming it is of the correct type.
  // The Anthropic API will validate the value.
  return cacheControlValue as AnthropicCacheControl | undefined;
}
