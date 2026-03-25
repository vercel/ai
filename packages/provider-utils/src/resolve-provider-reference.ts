import {
  NoSuchProviderReferenceError,
  SharedV4ProviderReference,
} from '@ai-sdk/provider';

export function resolveProviderReference({
  reference,
  provider,
}: {
  reference: SharedV4ProviderReference;
  provider: string;
}): string {
  const id = reference[provider];
  if (id != null) {
    return id;
  }

  throw new NoSuchProviderReferenceError({
    provider,
    availableProviders: Object.keys(reference),
  });
}
