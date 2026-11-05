import type { SharedV4ProviderOptions } from '@ai-sdk/provider';

/**
 * Takes the options that the SDK handles itself out of `providerOptions.gateway`
 * so that they are not sent to the Gateway service. Service options stay; an
 * empty `gateway` object and empty provider options are omitted. The caller's
 * object is not modified.
 */
export function splitClientGatewayOptions(
  providerOptions: SharedV4ProviderOptions | undefined,
): {
  streamingImageDecoding: boolean;
  providerOptions: SharedV4ProviderOptions | undefined;
} {
  const gatewayOptions = providerOptions?.gateway;
  const streamingImageDecoding =
    gatewayOptions?.experimental_streamingImageDecoding === true;

  if (
    gatewayOptions == null ||
    !('experimental_streamingImageDecoding' in gatewayOptions)
  ) {
    return { streamingImageDecoding, providerOptions };
  }

  const { experimental_streamingImageDecoding: _, ...serviceOptions } =
    gatewayOptions;
  const requestProviderOptions = { ...providerOptions };
  if (Object.keys(serviceOptions).length > 0) {
    requestProviderOptions.gateway = serviceOptions;
  } else {
    delete requestProviderOptions.gateway;
  }

  return {
    streamingImageDecoding,
    providerOptions:
      Object.keys(requestProviderOptions).length > 0
        ? requestProviderOptions
        : undefined,
  };
}
