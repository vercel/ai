import { SharedV2ProviderMetadata } from '@ai-sdk/provider';
import { AnthropicCacheControl } from './anthropic-api-types';

export function getCacheControl(
  providerMetadata: SharedV2ProviderMetadata | undefined,
): AnthropicCacheControl | undefined {
  const anthropic = providerMetadata?.anthropic;

  // allow both cacheControl and cache_control:
  const cacheControlValue = anthropic?.cacheControl ?? anthropic?.cache_control;

  // Pass through value assuming it is of the correct type.
  // The Anthropic API will validate the value.
  return cacheControlValue as AnthropicCacheControl | undefined;
}
