import { generateAuthToken } from './google-vertex-auth-google-auth-library';
import {
  createVertex as createVertexOriginal,
  GoogleVertexProvider,
  GoogleVertexProviderSettings as GoogleVertexProviderSettingsOriginal,
} from './google-vertex-provider';
import { GoogleAuthOptions } from 'google-auth-library';

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
    headers:
      options.headers ??
      (async () => ({
        Authorization: `Bearer ${await generateAuthToken(
          options.googleAuthOptions,
        )}`,
      })),
  });
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
