import {
  LanguageModelV4FilePart,
  SharedV4ProviderReference,
} from '@ai-sdk/provider';

/**
 * Checks whether file part data is a provider reference (a mapping of provider
 * names to provider-specific identifiers) as opposed to raw bytes or a URL.
 */
export function isProviderReference(
  data: LanguageModelV4FilePart['data'],
): data is SharedV4ProviderReference {
  return (
    typeof data === 'object' &&
    !(data instanceof Uint8Array) &&
    !(data instanceof URL)
  );
}
