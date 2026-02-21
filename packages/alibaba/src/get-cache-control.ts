import type {
  LanguageModelV2CallWarning,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider';
import type { AlibabaCacheControl } from './alibaba-chat-prompt';

// Alibaba allows a maximum of 4 cache breakpoints per request
const MAX_CACHE_BREAKPOINTS = 4;

function getCacheControl(
  providerMetadata: SharedV2ProviderMetadata | undefined,
): AlibabaCacheControl | undefined {
  const alibaba = providerMetadata?.alibaba;

  const cacheControlValue = alibaba?.cacheControl ?? alibaba?.cache_control;

  // Pass through value assuming it is of the correct type.
  // The Alibaba API will validate the value.
  return cacheControlValue as AlibabaCacheControl | undefined;
}

export class CacheControlValidator {
  private breakpointCount = 0;
  private warnings: LanguageModelV2CallWarning[] = [];

  getCacheControl(
    providerMetadata: SharedV2ProviderMetadata | undefined,
  ): AlibabaCacheControl | undefined {
    const cacheControlValue = getCacheControl(providerMetadata);

    if (!cacheControlValue) {
      return undefined;
    }

    // Validate cache breakpoint limit
    this.breakpointCount++;
    if (this.breakpointCount > MAX_CACHE_BREAKPOINTS) {
      this.warnings.push({
        type: 'other',
        message: `cacheControl breakpoint limit: Maximum ${MAX_CACHE_BREAKPOINTS} cache breakpoints exceeded (found ${this.breakpointCount}). This breakpoint will be ignored.`,
      });
      return undefined;
    }

    return cacheControlValue;
  }

  getWarnings(): LanguageModelV2CallWarning[] {
    return this.warnings;
  }
}
