import { generateAuthToken } from '../google-vertex-auth-edge';
import {
  createVertex as createVertexOriginal,
  GoogleVertexProvider,
  GoogleVertexProviderSettings,
} from '../google-vertex-provider';

export type { GoogleVertexProviderSettings, GoogleVertexProvider };

export function createVertex(
  options: GoogleVertexProviderSettings = {},
): GoogleVertexProvider {
  return createVertexOriginal({
    ...options,
    headers:
      options.headers ??
      (async () => ({
        Authorization: `Bearer ${await generateAuthToken()}`,
      })),
  });
}

/**
Default Google Vertex AI provider instance.
 */
export const vertex = createVertex();
