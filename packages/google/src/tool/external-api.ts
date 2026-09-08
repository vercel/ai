import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

type GoogleExternalApiAuthConfig = {
  apiKeyConfig?: {
    apiKeyString: string;
  };
  httpBasicAuthConfig?: {
    username: string;
    password: string;
  };
  googleServiceAccountConfig?: {
    serviceAccount: string;
  };
  oauthConfig?: {
    accessToken: string;
  };
  oidcConfig?: {
    idToken: string;
  };
};

type GoogleExternalApiCommonArgs = {
  /** HTTPS endpoint that implements the selected external API specification. */
  endpoint: string;

  /**
   * Authentication configuration for the external API.
   */
  authConfig?: GoogleExternalApiAuthConfig;

  /**
   * Legacy API-key authentication configuration.
   *
   * @deprecated Use `authConfig` instead.
   */
  apiAuth?: {
    apiKeyConfig: {
      apiKeyString: string;
    };
  };
};

export type GoogleExternalApiToolArgs = GoogleExternalApiCommonArgs &
  (
    | {
        apiSpec: 'SIMPLE_SEARCH';
        simpleSearchParams?: Record<string, never>;
        elasticSearchParams?: never;
      }
    | {
        apiSpec: 'ELASTIC_SEARCH';
        simpleSearchParams?: never;
        elasticSearchParams: {
          index: string;
          searchTemplate: string;
          numHits: number;
        };
      }
  );

/**
 * A tool that grounds model responses with an external search API.
 *
 * @note Only works with Vertex Gemini models.
 */
export const externalApi = createProviderExecutedToolFactory<
  {},
  {},
  GoogleExternalApiToolArgs
>({
  id: 'google.external_api',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
  outputSchema: lazySchema(() => zodSchema(z.object({}))),
});
