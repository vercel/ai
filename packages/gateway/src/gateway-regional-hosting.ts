import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type SharedV4ProviderOptions,
} from '@ai-sdk/provider';

const regionalBaseURLs = {
  au: 'https://au.ai-gateway.vercel.sh/v4/ai',
  eu: 'https://eu.ai-gateway.vercel.sh/v4/ai',
  us: 'https://us.ai-gateway.vercel.sh/v4/ai',
} as const;

export function getRegionalHostingBaseURL(regionalHosting: unknown): string {
  if (
    regionalHosting !== 'au' &&
    regionalHosting !== 'eu' &&
    regionalHosting !== 'us'
  ) {
    throw new InvalidArgumentError({
      argument: 'regionalHosting',
      message: 'regionalHosting must be one of: au, eu, us.',
    });
  }
  return regionalBaseURLs[regionalHosting];
}

export function resolveLanguageModelRegionalHosting({
  baseURL,
  hasExplicitBaseURL,
  providerOptions,
}: {
  baseURL: string;
  hasExplicitBaseURL?: boolean;
  providerOptions: SharedV4ProviderOptions | undefined;
}): { baseURL: string; providerOptions: SharedV4ProviderOptions | undefined } {
  const gatewayOptions = providerOptions?.gateway;
  if (gatewayOptions == null || !('regionalHosting' in gatewayOptions)) {
    return { baseURL, providerOptions };
  }

  const { regionalHosting, ...serviceOptions } = gatewayOptions;
  if (regionalHosting !== undefined) {
    baseURL = getRegionalHostingBaseURL(regionalHosting);
    if (hasExplicitBaseURL !== false) {
      throw new InvalidArgumentError({
        argument: 'regionalHosting',
        message:
          'regionalHosting requires a model created by an updated createGateway provider without an explicit baseURL, including standard Gateway URLs.',
      });
    }
  }

  const forwardedOptions = { ...providerOptions };
  if (Object.keys(serviceOptions).length > 0) {
    forwardedOptions.gateway = serviceOptions;
  } else {
    delete forwardedOptions.gateway;
  }
  return {
    baseURL,
    providerOptions:
      Object.keys(forwardedOptions).length > 0 ? forwardedOptions : undefined,
  };
}

export function rejectRegionalHosting(
  providerOptions: Record<string, unknown> | undefined,
): void {
  const gatewayOptions = providerOptions?.gateway;
  if (
    gatewayOptions != null &&
    typeof gatewayOptions === 'object' &&
    'regionalHosting' in gatewayOptions &&
    gatewayOptions.regionalHosting !== undefined
  ) {
    throw new UnsupportedFunctionalityError({
      functionality:
        'Per-call gateway.regionalHosting is only supported for language model generation and streaming. Use createGateway({ regionalHosting }) to configure an instance endpoint.',
    });
  }
}
