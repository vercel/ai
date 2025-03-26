import { resolve } from '@ai-sdk/provider-utils';
import { GoogleAuthOptions } from 'google-auth-library';
import { generateAuthToken } from '../google-vertex-auth-google-auth-library';
import {
  createVertexAnthropic as createVertexAnthropicOriginal,
  GoogleVertexAnthropicProvider,
  GoogleVertexAnthropicProviderSettings as GoogleVertexAnthropicProviderSettingsOriginal,
} from './google-vertex-anthropic-provider';

export type { GoogleVertexAnthropicProvider };

export interface GoogleVertexAnthropicProviderSettings
  extends GoogleVertexAnthropicProviderSettingsOriginal {
  /**
 Optional. The Authentication options provided by google-auth-library.
Complete list of authentication options is documented in the
GoogleAuthOptions interface:
https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts.
   */
  googleAuthOptions?: GoogleAuthOptions;
}

export function createVertexAnthropic(
  options: GoogleVertexAnthropicProviderSettings = {},
): GoogleVertexAnthropicProvider {
  return createVertexAnthropicOriginal({
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
Default Google Vertex Anthropic provider instance.
 */
export const vertexAnthropic = createVertexAnthropic();
