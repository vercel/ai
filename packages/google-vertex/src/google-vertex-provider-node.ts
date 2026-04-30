import { resolve } from '@ai-sdk/provider-utils';
import type { GoogleAuthOptions } from 'google-auth-library';
import { generateAuthToken } from './google-vertex-auth-google-auth-library';
import type {
  GoogleVertexProvider,
  GoogleVertexProviderSettings as GoogleVertexProviderSettingsOriginal} from './google-vertex-provider';
import {
  createVertex as createVertexOriginal
} from './google-vertex-provider';

export interface GoogleVertexProviderSettings extends GoogleVertexProviderSettingsOriginal {
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
    headers: async () => ({
      Authorization: `Bearer ${await generateAuthToken(
        options.googleAuthOptions,
      )}`,
      ...(await resolve(options.headers)),
    }),
  });
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
