import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-your-search-api
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/Tool#ExternalApi

export const externalApi = createProviderToolFactory<
  {},
  {
    /**
     * The API spec that the external API implements.
     */
    apiSpec: 'SIMPLE_SEARCH' | 'ELASTIC_SEARCH';
    /**
     * The endpoint of the external API. The system will call the API at this endpoint to retrieve the data for grounding.
     * @example "https://acme.com:443/search"
     */
    endpoint: string;
    /**
     * The authentication config to access the API. Deprecated.
     *
     * @deprecated Please use `authConfig` instead.
     * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/ApiAuth | ApiAuth}
     */
    apiAuth?: {
      apiKeySecretVersion?: string;
      apiKeyString?: string;
    };
    /**
     * The authentication config to access the API.
     *
     * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig | AuthConfig}
     */
    authConfig: {
      apiKeyConfig?: {
        /**
         * The parameter name of the API key. E.g. If the API request is "https://example.com/act?apiKey=", "apiKey" would be the parameter name.
         */
        name?: string;
        /**
         * The name of the SecretManager secret version resource storing the API key. Format: projects/{project}/secrets/{secrete}/versions/{version}
         */
        apiKeySecret?: string;
        /**
         * The API key to be used in the request directly.
         */
        apiKeyString?: string;
        /**
         * The location of the API key.
         */
        httpElementLocation?:
          | 'HTTP_IN_QUERY'
          | 'HTTP_IN_HEADER'
          | 'HTTP_IN_PATH'
          | 'HTTP_IN_BODY'
          | 'HTTP_IN_COOKIE';
      };
      httpBasicAuthConfig?: {
        /**
         * The name of the SecretManager secret version resource storing the base64 encoded credentials. Format: projects/{project}/secrets/{secrete}/versions/{version}
         */
        credentialSecret: string;
      };
      googleServiceAccountConfig?: {
        /**
         * The service account that the extension execution service runs as.
         */
        serviceAccount?: string;
      };
      oauthConfig?: {
        /**
         * Access token for extension endpoint. Only used to propagate token from [[ExecuteExtensionRequest.runtime_auth_config]] at request time.
         */
        accessToken?: string;
        /**
         * The service account used to generate access tokens for executing the Extension.
         */
        serviceAccount?: string;
      };
      oidcConfig?: {
        /**
         * OpenID Connect formatted id token for extension endpoint. Only used to propagate token from [[ExecuteExtensionRequest.runtime_auth_config]] at request time.
         */
        idToken?: string;
        /**
         * The service account used to generate an OpenID Connect (OIDC)-compatible JWT token signed by the Google OIDC Provider (accounts.google.com) for extension endpoint (https://cloud.google.com/iam/docs/create-short-lived-credentials-direct#sa-credentials-oidc).
         */
        serviceAccount?: string;
      };
    };
    /**
     * Parameters for the API call. This should be matched with the API spec used.
     */
    params: {
      /**
       * Parameters for the simple search API.
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/Tool#SimpleSearchParams | SimpleSearchParams}
       */
      simpleSearchParams?: Record<string, never>;
      /**
       * Parameters for the elastic search API.
       *
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/Tool#ElasticSearchParams | ElasticSearchParams}
       */
      elasticSearchParams: {
        /**
         * The ElasticSearch index to use.
         */
        index?: string;
        /**
         * The ElasticSearch search template to use.
         */
        searchTemplate?: string;
        /**
         * When specified, it is passed to Elasticsearch as the numHits param.
         */
        numHits?: number;
      };
    };
  }
>({
  id: 'google.external_api',
  inputSchema: lazySchema(() =>
    zodSchema(
      z.object({
        apiSpec: z.enum(['SIMPLE_SEARCH', 'ELASTIC_SEARCH']),
        endpoint: z.string(),
        apiAuth: z
          .object({
            apiKeySecretVersion: z.string().optional(),
            apiKeyString: z.string().optional(),
          })
          .optional(),
        authConfig: z.object({
          apiKeyConfig: z
            .object({
              name: z.string().optional(),
              apiKeySecret: z.string().optional(),
              apiKeyString: z.string().optional(),
              httpElementLocation: z
                .union([
                  z.literal('HTTP_IN_QUERY'),
                  z.literal('HTTP_IN_HEADER'),
                  z.literal('HTTP_IN_PATH'),
                  z.literal('HTTP_IN_BODY'),
                  z.literal('HTTP_IN_COOKIE'),
                ])
                .optional(),
            })
            .optional(),
          httpBasicAuthConfig: z
            .object({
              credentialSecret: z.string(),
            })
            .optional(),
          googleServiceAccountConfig: z
            .object({
              serviceAccount: z.string().optional(),
            })
            .optional(),
          oauthConfig: z
            .object({
              accessToken: z.string().optional(),
              serviceAccount: z.string().optional(),
            })
            .optional(),
          oidcConfig: z
            .object({
              idToken: z.string().optional(),
              serviceAccount: z.string().optional(),
            })
            .optional(),
        }),
        params: z.object({
          simpleSearchParams: z.record(z.string(), z.never()).optional(),
          elasticSearchParams: z.object({
            index: z.string().optional(),
            searchTemplate: z.string().optional(),
            numHits: z.number().optional(),
          }),
        }),
      }),
    ),
  ),
});
