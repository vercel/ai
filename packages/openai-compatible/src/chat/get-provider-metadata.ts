import { SharedV3ProviderMetadata } from '@ai-sdk/provider';

/**
 * Extracts provider-specific metadata from providerOptions.
 *
 * This function first checks for metadata under the specific provider name,
 * and falls back to the legacy 'openaiCompatible' key for backwards compatibility.
 *
 * @param item - An object that may contain providerOptions
 * @param providerName - The name of the provider (e.g., 'openai', 'anthropic', 'test-provider')
 * @returns The merged metadata object
 *
 * @example
 * // New approach (provider-specific)
 * getProviderMetadata({ providerOptions: { openai: { user: 'test' } } }, 'openai')
 * // Returns: { user: 'test' }
 *
 * @example
 * // Legacy approach (backwards compatible)
 * getProviderMetadata({ providerOptions: { openaiCompatible: { user: 'test' } } }, 'openai')
 * // Returns: { user: 'test' }
 *
 * @example
 * // Provider-specific takes precedence over legacy
 * getProviderMetadata({
 *   providerOptions: {
 *     openai: { user: 'new' },
 *     openaiCompatible: { user: 'old', extra: 'data' }
 *   }
 * }, 'openai')
 * // Returns: { user: 'new', extra: 'data' }
 */
export function getProviderMetadata(
  item: {
    providerOptions?: SharedV3ProviderMetadata;
  },
  providerName: string,
): Record<string, unknown> {
  const legacyMetadata = item?.providerOptions?.openaiCompatible ?? {};
  const providerMetadata = item?.providerOptions?.[providerName] ?? {};

  // Provider-specific metadata takes precedence over legacy metadata
  return {
    ...legacyMetadata,
    ...providerMetadata,
  };
}
