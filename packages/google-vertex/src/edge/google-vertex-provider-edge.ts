import { resolve } from '@ai-sdk/provider-utils';
import {
  createVertex as createVertexOriginal,
  GoogleVertexProvider,
  GoogleVertexProviderSettings as GoogleVertexProviderSettingsOriginal,
} from '../google-vertex-provider';
import {
  generateAuthToken,
  GoogleCredentials,
} from './google-vertex-auth-edge';

export type { GoogleVertexProvider };

export interface GoogleVertexProviderSettings
  extends GoogleVertexProviderSettingsOriginal {
  /**
   * Optional. The Google credentials for the Google Cloud service account. If
   * not provided, the Google Vertex provider will use environment variables to
   * load the credentials.
   */
  googleCredentials?: GoogleCredentials;
}

export function createVertex(
  options: GoogleVertexProviderSettings = {},
): GoogleVertexProvider {
  return createVertexOriginal({
    ...options,
    headers: async () => {
      const resolvedHeaders = await resolve(options.headers);

      // Express Mode - Use API key authentication
      if (options.apiKey) {
        return {
          'x-goog-api-key': options.apiKey,
          ...resolvedHeaders,
        };
      }

      // OAuth Mode - Use Bearer token authentication
      return {
        Authorization: `Bearer ${await generateAuthToken(
          options.googleCredentials,
        )}`,
        ...resolvedHeaders,
      };
    },
  });
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
