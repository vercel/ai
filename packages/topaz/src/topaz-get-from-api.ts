import {
  fetchWithValidatedEndpoint,
  fetchWithValidatedRedirects,
  getFromApi,
  isSameOrigin,
  type FetchFunction,
} from '@ai-sdk/provider-utils';

/**
 * Adapts URL validation to v6's getFromApi, which does not yet expose the
 * validateUrl and credentialedOrigin options.
 */
export async function topazGetFromApi<T>({
  validateUrl,
  credentialedOrigin,
  trustedOrigin,
  ...options
}: Parameters<typeof getFromApi<T>>[0] & {
  validateUrl: boolean;
  credentialedOrigin?: string;
  trustedOrigin?: string;
}) {
  const validatedFetch: FetchFunction = (url, init) =>
    fetchWithValidatedRedirects({
      url: url.toString(),
      headers: init?.headers,
      abortSignal: init?.signal ?? undefined,
      trustedOrigin,
      fetch: (hopUrl, hopInit) =>
        fetchWithValidatedEndpoint({
          url: hopUrl.toString(),
          init: {
            ...hopInit,
            headers:
              credentialedOrigin != null &&
              isSameOrigin(hopUrl.toString(), credentialedOrigin)
                ? hopInit?.headers
                : undefined,
          },
          trustedOrigin,
          redirect: 'manual',
          fetch: options.fetch,
        }),
    });

  // v6 ignores this flag; validation is handled by the injected fetch above.
  const requestOptions = {
    ...options,
    validateUrl: false,
    fetch: validateUrl ? validatedFetch : options.fetch,
  };
  return getFromApi(requestOptions);
}
