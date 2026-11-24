import {
  fetchWithValidatedEndpoint,
  isBrowserRuntime,
  isSameOrigin,
  resolve,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import {
  generateAuthToken,
  type GoogleCredentials,
} from '../../edge/google-vertex-auth-edge';
import {
  createGoogleVertexMaas as createVertexMaasOriginal,
  loadGoogleVertexMaasBaseURL,
  type GoogleVertexMaasProvider,
  type GoogleVertexMaasProviderSettings as GoogleVertexMaasProviderSettingsOriginal,
} from '../google-vertex-maas-provider';
export type { GoogleVertexMaasProvider };

export interface GoogleVertexMaasProviderSettings extends GoogleVertexMaasProviderSettingsOriginal {
  /**
   * Optional. The Google credentials for the Google Cloud service account. If
   * not provided, the Google Vertex provider will use environment variables to
   * load the credentials.
   */
  googleCredentials?: GoogleCredentials;
}

/**
 * Create a Google Vertex AI MaaS (Model as a Service) provider instance for Edge runtimes.
 * Uses the OpenAI-compatible Chat Completions API for partner and open models.
 * Automatically handles Google Cloud authentication.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/maas/use-open-models
 */
export function createGoogleVertexMaas(
  options: GoogleVertexMaasProviderSettings = {},
): GoogleVertexMaasProvider {
  // Create a custom fetch wrapper that adds auth headers
  const customFetch: FetchFunction = async (url, init) => {
    // Credentials only go to the MaaS API. Other URLs, e.g. image URLs from a
    // response and the hops of their redirects, are fetched without them:
    const href =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (!isSameOrigin(href, loadGoogleVertexMaasBaseURL(options))) {
      // Preserve the browser-only retry after an opaque manual redirect.
      if (isBrowserRuntime() && init?.redirect === 'follow') {
        return (options.fetch ?? fetch)(url, init);
      }

      // Validate the URL and keep redirects manual behind this auth wrapper.
      // Uses the configured fetch (e.g. guarded-fetch) or the runtime's fetch.
      return fetchWithValidatedEndpoint({
        url: href,
        init,
        fetch: options.fetch,
        redirect: 'manual',
      });
    }

    const token = await generateAuthToken(options.googleCredentials);
    const resolvedHeaders = await resolve(options.headers);
    const authHeaders = {
      ...resolvedHeaders,
      Authorization: `Bearer ${token}`,
    };

    // Merge auth headers with existing headers from init
    const fetchInit = {
      ...init,
      headers: {
        ...init?.headers,
        ...authHeaders,
      },
    };

    // Call the original fetch or user's custom fetch
    return (options.fetch ?? fetch)(url, fetchInit);
  };

  return createVertexMaasOriginal({
    ...options,
    fetch: customFetch,
    headers: undefined, // Don't pass headers, we handle them in fetch
  });
}

/**
 * Default Google Vertex AI MaaS provider instance for Edge runtimes.
 */
export const googleVertexMaas = createGoogleVertexMaas();
