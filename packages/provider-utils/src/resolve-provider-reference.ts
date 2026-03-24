import { SharedV4ProviderReference } from '@ai-sdk/provider';

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

  const availableProviders = Object.keys(reference).join(', ');
  throw new Error(
    `No reference found for provider '${provider}'. Available providers: ${availableProviders}`,
  );
}
