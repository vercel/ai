import { resolve } from '@ai-sdk/provider-utils';
import { GoogleAuthOptions } from 'google-auth-library';
import { generateAuthToken } from './google-vertex-auth-google-auth-library';
import {
  createVertex as createVertexOriginal,
  GoogleVertexProvider,
  GoogleVertexProviderSettings as GoogleVertexProviderSettingsOriginal,
} from './google-vertex-provider';

export interface GoogleVertexProviderSettings
  extends GoogleVertexProviderSettingsOriginal {
  /**
 Optional. The Authentication options provided by google-auth-library.
Complete list of authentication options is documented in the
GoogleAuthOptions interface:
https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts.
   */
  googleAuthOptions?: GoogleAuthOptions;
}

export type { GoogleVertexProvider };

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
          options.googleAuthOptions,
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
