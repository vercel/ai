import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { OpenAICompatibleProvider } from '@ai-sdk/openai-compatible';
import {
  FetchFunction,
  loadOptionalSetting,
  loadSetting,
  Resolvable,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import type { GoogleVertexMaasModelId } from './google-vertex-maas-options';

export interface GoogleVertexMaasProvider
  extends OpenAICompatibleProvider<
    GoogleVertexMaasModelId,
    string,
    string,
    string
  > {}

export interface GoogleVertexMaasProviderSettings {
  /**
   * Google Cloud project ID. Defaults to the value of the `GOOGLE_VERTEX_PROJECT` environment variable.
   */
  project?: string;

  /**
   * Google Cloud location/region. Defaults to the value of the `GOOGLE_VERTEX_LOCATION` environment variable.
   * Use 'global' for the global endpoint.
   */
  location?: string;

  /**
   * Base URL for the API calls. If not provided, will be constructed from project and location.
   */
  baseURL?: string;

  /**
   * Headers to use for requests. Can be:
   * - A headers object
   * - A Promise that resolves to a headers object
   * - A function that returns a headers object
   * - A function that returns a Promise of a headers object
   */
  headers?: Resolvable<Record<string, string | undefined>>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create a Google Vertex AI MaaS (Model as a Service) provider instance.
 * Uses the OpenAI-compatible Chat Completions API for partner and open models.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/maas/use-open-models
 */
export function createVertexMaas(
  options: GoogleVertexMaasProviderSettings = {},
): GoogleVertexMaasProvider {
  // Lazy-load settings to support loading from environment variables at runtime
  const loadLocation = () =>
    loadOptionalSetting({
      settingValue: options.location,
      environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
    });

  const loadProject = () =>
    loadSetting({
      settingValue: options.project,
      settingName: 'project',
      environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
      description: 'Google Vertex project',
    });

  // Construct base URL: https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi
  const constructBaseURL = () => {
    const projectId = loadProject();
    const location = loadLocation() ?? 'global';

    return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/endpoints/openapi`;
  };

  const baseURL =
    withoutTrailingSlash(options.baseURL ?? '') || constructBaseURL();

  return createOpenAICompatible({
    name: 'vertex.maas',
    baseURL,
    // Note: headers are not passed here as they are handled by the auth wrapper
    // in the Node.js/Edge-specific implementations via the fetch function
    fetch: options.fetch,
  });
}
