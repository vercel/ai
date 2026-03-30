import {
  LanguageModelV4FilePart,
  SharedV4ProviderReference,
} from '@ai-sdk/provider';

export function isProviderReference(
  data: LanguageModelV4FilePart['data'],
): data is SharedV4ProviderReference {
  return (
    typeof data === 'object' &&
    !(data instanceof Uint8Array) &&
    !(data instanceof URL)
  );
}
