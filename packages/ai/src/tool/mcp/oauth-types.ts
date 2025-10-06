import { z } from 'zod/v4';
/**
 * OAuth 2.1 token response
 */
export const OAuthTokensSchema = z
  .object({
    access_token: z.string(),
    id_token: z.string().optional(), // Optional for OAuth 2.1, but necessary in OpenID Connect
    token_type: z.string(),
    expires_in: z.number().optional(),
    scope: z.string().optional(),
    refresh_token: z.string().optional(),
  })
  .strip();

/**
 * Reusable URL validation that disallows javascript: scheme
 */
export const SafeUrlSchema = z
  .string()
  .url()
  .superRefine((val, ctx) => {
    if (!URL.canParse(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must be parseable',
        fatal: true,
      });

      return z.NEVER;
    }
  })
  .refine(
    url => {
      const u = new URL(url);
      return (
        u.protocol !== 'javascript:' &&
        u.protocol !== 'data:' &&
        u.protocol !== 'vbscript:'
      );
    },
    { message: 'URL cannot use javascript:, data:, or vbscript: scheme' },
  );

export const OAuthProtectedResourceMetadataSchema = z
  .object({
    resource: z.string().url(),
    authorization_servers: z.array(SafeUrlSchema).optional(),
    jwks_uri: z.string().url().optional(),
    scopes_supported: z.array(z.string()).optional(),
    bearer_methods_supported: z.array(z.string()).optional(),
    resource_signing_alg_values_supported: z.array(z.string()).optional(),
    resource_name: z.string().optional(),
    resource_documentation: z.string().optional(),
    resource_policy_uri: z.string().url().optional(),
    resource_tos_uri: z.string().url().optional(),
    tls_client_certificate_bound_access_tokens: z.boolean().optional(),
    authorization_details_types_supported: z.array(z.string()).optional(),
    dpop_signing_alg_values_supported: z.array(z.string()).optional(),
    dpop_bound_access_tokens_required: z.boolean().optional(),
  })
  .passthrough();

export type OAuthTokens = z.infer<typeof OAuthTokensSchema>;
export type OAuthProtectedResourceMetadata = z.infer<
  typeof OAuthProtectedResourceMetadataSchema
>;
