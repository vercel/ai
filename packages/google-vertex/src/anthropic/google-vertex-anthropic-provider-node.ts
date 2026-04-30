import { resolve } from '@ai-sdk/provider-utils';
import type { GoogleAuthOptions } from 'google-auth-library';
import { generateAuthToken as defaultGenerateAuthToken } from '../google-vertex-auth-google-auth-library';
import {
  createVertexAnthropic as createVertexAnthropicOriginal,
  type GoogleVertexAnthropicProvider,
  type GoogleVertexAnthropicProviderSettings as GoogleVertexAnthropicProviderSettingsOriginal,
} from './google-vertex-anthropic-provider';
export type { GoogleVertexAnthropicProvider };

export interface GoogleVertexAnthropicProviderSettings extends GoogleVertexAnthropicProviderSettingsOriginal {
  /**
   * Optional. The Authentication options provided by google-auth-library.
   * Complete list of authentication options is documented in the
   * GoogleAuthOptions interface:
   * https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts.
   */
  googleAuthOptions?: GoogleAuthOptions;
  /**
   * Optional. Override the Bearer token generator. Defaults to OAuth exchange
   * via `google-auth-library` with `googleAuthOptions`.
   */
  generateAuthToken?: () => Promise<string | null>;
}

export function createVertexAnthropic(
  options: GoogleVertexAnthropicProviderSettings = {},
): GoogleVertexAnthropicProvider {
  const generateAuthToken =
    options.generateAuthToken ??
    (() => defaultGenerateAuthToken(options.googleAuthOptions));
  return createVertexAnthropicOriginal({
    ...options,
    headers: async () => ({
      Authorization: `Bearer ${await generateAuthToken()}`,
      ...(await resolve(options.headers)),
    }),
  });
}

/**
 * Default Google Vertex Anthropic provider instance.
 */
export const vertexAnthropic = createVertexAnthropic();
