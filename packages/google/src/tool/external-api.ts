import {
  createProviderToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-your-search-api
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/Tool#ExternalApi

const externalAPIArgsBaseSchema = z.object({
  /**
   * The API spec that the external API implements.
   */
  apiSpec: z.enum(['SIMPLE_SEARCH', 'ELASTIC_SEARCH']),
  /**
   * The endpoint of the external API. The system will call the API at this endpoint to retrieve the data for grounding.
   * @example "https://acme.com:443/search"
   */
  endpoint: z.string(),
  /**
   * The authentication config to access the API. Deprecated.
   * @deprecated Please use `authConfig` instead.
   * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/ApiAuth | ApiAuth}
   */
  apiAuth: z
    .object({
      /**
       * The API secret.
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/ApiKeyConfig | ApiKeyConfig}
       */
      apiKeyConfig: z.object({
        /**
         * The SecretManager secret version resource name storing API key. e.g. projects/{project}/secrets/{secret}/versions/{version}
         */
        apiKeySecretVersion: z.string().optional(),
        /**
         * The API key string.
         */
        apiKeyString: z.string().optional(),
      }),
    })
    .optional(),
  /**
   * The authentication config to access the API.
   * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig | AuthConfig}
   */
  authConfig: z
    .object({
      /**
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig#ApiKeyConfig | ApiKeyConfig}
       */
      apiKeyConfig: z
        .object({
          /**
           * The parameter name of the API key. E.g. If the API request is "https://example.com/act?apiKey=", "apiKey" would be the parameter name.
           */
          name: z.string().optional(),
          /**
           * The name of the SecretManager secret version resource storing the API key. Format: projects/{project}/secrets/{secrete}/versions/{version}
           */
          apiKeySecret: z.string().optional(),
          /**
           * The API key to be used in the request directly.
           */
          apiKeyString: z.string().optional(),
          /**
           * The location of the API key.
           * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig#HttpElementLocation | HttpElementLocation}
           */
          httpElementLocation: z
            .enum([
              'HTTP_IN_QUERY',
              'HTTP_IN_HEADER',
              'HTTP_IN_PATH',
              'HTTP_IN_BODY',
              'HTTP_IN_COOKIE',
            ])
            .optional(),
        })
        .optional(),
      /**
       * Config for HTTP Basic Authentication.
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig#HttpBasicAuthConfig | HttpBasicAuthConfig}
       */
      httpBasicAuthConfig: z
        .object({
          /**
           * The name of the SecretManager secret version resource storing the base64 encoded credentials. Format: projects/{project}/secrets/{secrete}/versions/{version}
           */
          credentialSecret: z.string(),
        })
        .optional(),
      /**
       * Config for Google service Account auth.
       *
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig#GoogleServiceAccountConfig | GoogleServiceAccountConfig}
       */
      googleServiceAccountConfig: z
        .object({
          /**
           * The service account that the extension execution service runs as.
           */
          serviceAccount: z.string().optional(),
        })
        .optional(),
      /**
       * Config for user oauth.
       *
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig#OauthConfig | OauthConfig}
       */
      oauthConfig: z
        .object({
          /**
           * Access token for extension endpoint. Only used to propagate token from [[ExecuteExtensionRequest.runtime_auth_config]] at request time.
           */
          accessToken: z.string().optional(),
          /**
           * The service account used to generate access tokens for executing the Extension.
           */
          serviceAccount: z.string().optional(),
        })
        .optional(),
      /**
       * Config for user OIDC auth.
       *
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/AuthConfig#OidcConfig | OidcConfig}
       */
      oidcConfig: z
        .object({
          /**
           * OpenID Connect formatted id token for extension endpoint. Only used to propagate token from [[ExecuteExtensionRequest.runtime_auth_config]] at request time.
           */
          idToken: z.string().optional(),
          /**
           * The service account used to generate an OpenID Connect (OIDC)-compatible JWT token signed by the Google OIDC Provider (accounts.google.com) for extension endpoint (https://cloud.google.com/iam/docs/create-short-lived-credentials-direct#sa-credentials-oidc).
           */
          serviceAccount: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  /**
   * Parameters for the API call. This should be matched with the API spec used.
   */
  params: z
    .object({
      /**
       * Parameters for the simple search API.
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/Tool#SimpleSearchParams | SimpleSearchParams}
       */
      simpleSearchParams: z.record(z.string(), z.never()).optional(),
      /**
       * Parameters for the elastic search API.
       *
       * @see {@link https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/Tool#ElasticSearchParams | ElasticSearchParams}
       */
      elasticSearchParams: z
        .object({
          /**
           * The ElasticSearch index to use.
           */
          index: z.string().optional(),
          /**
           * The ElasticSearch search template to use.
           */
          searchTemplate: z.string().optional(),
          /**
           * When specified, it is passed to Elasticsearch as the numHits param.
           */
          numHits: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type GoogleExternalAPIoolArgs = z.infer<
  typeof externalAPIArgsBaseSchema
>;

const externalAPIArgsSchema = lazySchema(() =>
  zodSchema(externalAPIArgsBaseSchema),
);

export const externalApi = createProviderToolFactory<
  {},
  GoogleExternalAPIoolArgs
>({
  id: 'google.external_api',
  inputSchema: externalAPIArgsSchema,
});
