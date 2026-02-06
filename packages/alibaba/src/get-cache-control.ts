import { SharedV3Warning, SharedV3ProviderMetadata } from '@ai-sdk/provider';
import { AlibabaCacheControl } from './alibaba-chat-prompt';

// Alibaba allows a maximum of 4 cache breakpoints per request
const MAX_CACHE_BREAKPOINTS = 4;

function getCacheControl(
  providerMetadata: SharedV3ProviderMetadata | undefined,
): AlibabaCacheControl | undefined {
  const alibaba = providerMetadata?.alibaba;

  const cacheControlValue = alibaba?.cacheControl ?? alibaba?.cache_control;

  // Pass through value assuming it is of the correct type.
  // The Alibaba API will validate the value.
  return cacheControlValue as AlibabaCacheControl | undefined;
}

export class CacheControlValidator {
  private breakpointCount = 0;
  private warnings: SharedV3Warning[] = [];

  getCacheControl(
    providerMetadata: SharedV3ProviderMetadata | undefined,
  ): AlibabaCacheControl | undefined {
    const cacheControlValue = getCacheControl(providerMetadata);

    if (!cacheControlValue) {
      return undefined;
    }

    // Validate cache breakpoint limit
    this.breakpointCount++;
    if (this.breakpointCount > MAX_CACHE_BREAKPOINTS) {
      this.warnings.push({
        type: 'unsupported',
        feature: 'cacheControl breakpoint limit',
        details: `Maximum ${MAX_CACHE_BREAKPOINTS} cache breakpoints exceeded (found ${this.breakpointCount}). This breakpoint will be ignored.`,
      });
      return undefined;
    }

    return cacheControlValue;
  }

  getWarnings(): SharedV3Warning[] {
    return this.warnings;
  }
}
