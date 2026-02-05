import { loadOptionalSetting, resolve } from '@ai-sdk/provider-utils';
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
  const apiKey = loadOptionalSetting({
    settingValue: options.apiKey,
    environmentVariableName: 'GOOGLE_VERTEX_API_KEY',
  });

  if (apiKey) {
    return createVertexOriginal(options);
  }

  return createVertexOriginal({
    ...options,
    headers: async () => ({
      Authorization: `Bearer ${await generateAuthToken(
        options.googleCredentials,
      )}`,
      ...(await resolve(options.headers)),
    }),
  });
}

/**
 * Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
