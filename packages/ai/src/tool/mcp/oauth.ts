import pkceChallenge from 'pkce-challenge';
import {
  OAuthTokens,
  OAuthProtectedResourceMetadata,
  OAuthProtectedResourceMetadataSchema,
  OAuthMetadataSchema,
  OpenIdProviderDiscoveryMetadataSchema,
  AuthorizationServerMetadata,
  OAuthClientInformation,
} from './oauth-types';
import { LATEST_PROTOCOL_VERSION } from './types';
import { FetchFunction } from '@ai-sdk/provider-utils';

export type AuthResult = 'AUTHORIZED' | 'UNAUTHORIZED';

export interface OAuthClientProvider {
  /**
   * Returns current access token if present; undefined otherwise.
   */
  tokens(): OAuthTokens | undefined | Promise<OAuthTokens | undefined>;

  /**
   * Performs (or completes) OAuth for the given server.
   * Should persist tokens so subsequent tokens() calls return the new access_token.
   */
  authorize(options: {
    serverUrl: URL;
    resourceMetadataUrl?: URL;
  }): Promise<AuthResult>;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Extracts the OAuth 2.0 Protected Resource Metadata URL from a WWW-Authenticate header (RFC9728).
 * Looks for a resource="..." parameter.
 */
export function extractResourceMetadataUrl(
  response: Response,
): URL | undefined {
  const header =
    response.headers.get('www-authenticate') ??
    response.headers.get('WWW-Authenticate');
  if (!header) {
    return undefined;
  }

  const [type, scheme] = header.split(' ');
  if (type.toLowerCase() !== 'bearer' || !scheme) {
    return undefined;
  }

  // Example: WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"
  // regex taken from MCP spec
  const regex = /resource_metadata="([^"]*)"/;
  const match = header.match(regex);
  if (!match) {
    return undefined;
  }

  try {
    return new URL(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Constructs the well-known path for auth-related metadata discovery
 */
function buildWellKnownPath(
  wellKnownPrefix:
    | 'oauth-authorization-server'
    | 'oauth-protected-resource'
    | 'openid-configuration',
  pathname: string = '',
  options: { prependPathname?: boolean } = {},
): string {
  // Strip trailing slash from pathname to avoid double slashes
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return options.prependPathname
    ? `${pathname}/.well-known/${wellKnownPrefix}`
    : `/.well-known/${wellKnownPrefix}${pathname}`;
}

async function fetchWithCorsRetry(
  url: URL,
  headers?: Record<string, string>,
  fetchFn: FetchFunction = fetch,
): Promise<Response | undefined> {
  try {
    return await fetchFn(url, { headers });
  } catch (error) {
    if (error instanceof TypeError) {
      if (headers) {
        // CORS errors come back as TypeError, retry without headers
        return fetchWithCorsRetry(url, undefined, fetchFn);
      } else {
        // We're getting CORS errors on retry too, return undefined
        return undefined;
      }
    }
    throw error;
  }
}

/**
 * Tries to discover OAuth metadata at a specific URL
 */
async function tryMetadataDiscovery(
  url: URL,
  protocolVersion: string,
  fetchFn: FetchFunction = fetch,
): Promise<Response | undefined> {
  const headers = {
    'MCP-Protocol-Version': protocolVersion,
  };
  return await fetchWithCorsRetry(url, headers, fetchFn);
}

/**
 * Determines if fallback to root discovery should be attempted
 */
function shouldAttemptFallback(
  response: Response | undefined,
  pathname: string,
): boolean {
  return (
    !response ||
    (response.status >= 400 && response.status < 500 && pathname !== '/')
  );
}

/**
 * Generic function for discovering OAuth metadata with fallback support
 */
async function discoverMetadataWithFallback(
  serverUrl: string | URL,
  wellKnownType: 'oauth-authorization-server' | 'oauth-protected-resource',
  fetchFn: FetchFunction,
  opts?: {
    protocolVersion?: string;
    metadataUrl?: string | URL;
    metadataServerUrl?: string | URL;
  },
): Promise<Response | undefined> {
  const issuer = new URL(serverUrl);
  const protocolVersion = opts?.protocolVersion ?? LATEST_PROTOCOL_VERSION;

  let url: URL;
  if (opts?.metadataUrl) {
    url = new URL(opts.metadataUrl);
  } else {
    // Try path-aware discovery first
    const wellKnownPath = buildWellKnownPath(wellKnownType, issuer.pathname);
    url = new URL(wellKnownPath, opts?.metadataServerUrl ?? issuer);
    url.search = issuer.search;
  }

  let response = await tryMetadataDiscovery(url, protocolVersion, fetchFn);

  // If path-aware discovery fails with 404 and we're not already at root, try fallback to root discovery
  if (!opts?.metadataUrl && shouldAttemptFallback(response, issuer.pathname)) {
    const rootUrl = new URL(`/.well-known/${wellKnownType}`, issuer);
    response = await tryMetadataDiscovery(rootUrl, protocolVersion, fetchFn);
  }

  return response;
}

export async function discoverOAuthProtectedResourceMetadata(
  serverUrl: string | URL,
  opts?: { protocolVersion?: string; resourceMetadataUrl?: string | URL },
  fetchFn: FetchFunction = fetch,
): Promise<OAuthProtectedResourceMetadata> {
  const response = await discoverMetadataWithFallback(
    serverUrl,
    'oauth-protected-resource',
    fetchFn,
    {
      protocolVersion: opts?.protocolVersion,
      metadataUrl: opts?.resourceMetadataUrl,
    },
  );

  if (!response || response.status === 404) {
    throw new Error(
      `Resource server does not implement OAuth 2.0 Protected Resource Metadata.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} trying to load well-known OAuth protected resource metadata.`,
    );
  }
  return OAuthProtectedResourceMetadataSchema.parse(await response.json());
}

/**
 * Builds a list of discovery URLs to try for authorization server metadata.
 * URLs are returned in priority order:
 * 1. OAuth metadata at the given URL
 * 2. OAuth metadata at root (if URL has path)
 * 3. OIDC metadata endpoints
 */
export function buildDiscoveryUrls(
  authorizationServerUrl: string | URL,
): { url: URL; type: 'oauth' | 'oidc' }[] {
  const url =
    typeof authorizationServerUrl === 'string'
      ? new URL(authorizationServerUrl)
      : authorizationServerUrl;
  const hasPath = url.pathname !== '/';
  const urlsToTry: { url: URL; type: 'oauth' | 'oidc' }[] = [];

  if (!hasPath) {
    // Root path: https://example.com/.well-known/oauth-authorization-server
    urlsToTry.push({
      url: new URL('/.well-known/oauth-authorization-server', url.origin),
      type: 'oauth',
    });

    urlsToTry.push({
      url: new URL('/.well-known/openid-configuration', url.origin),
      type: 'oidc',
    });

    return urlsToTry;
  }

  // Strip trailing slash from pathname to avoid double slashes
  let pathname = url.pathname;
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // 1. OAuth metadata at the given URL
  // Insert well-known before the path: https://example.com/.well-known/oauth-authorization-server/tenant1
  urlsToTry.push({
    url: new URL(
      `/.well-known/oauth-authorization-server${pathname}`,
      url.origin,
    ),
    type: 'oauth',
  });

  // Root path: https://example.com/.well-known/oauth-authorization-server
  urlsToTry.push({
    url: new URL('/.well-known/oauth-authorization-server', url.origin),
    type: 'oauth',
  });

  // 3. OIDC metadata endpoints
  //RFC 8414 style: Insert /.well-known/openid-configuration before the path
  urlsToTry.push({
    url: new URL(`/.well-known/openid-configuration${pathname}`, url.origin),
    type: 'oidc',
  });

  // OIDC Discovery 1.0 style: Append /.well-known/openid-configuration after the path
  urlsToTry.push({
    url: new URL(`${pathname}/.well-known/openid-configuration`, url.origin),
    type: 'oidc',
  });

  return urlsToTry;
}

export async function discoverAuthorizationServerMetadata(
  authorizationServerUrl: string | URL,
  {
    fetchFn = fetch,
    protocolVersion = LATEST_PROTOCOL_VERSION,
  }: {
    fetchFn?: FetchFunction;
    protocolVersion?: string;
  } = {},
): Promise<AuthorizationServerMetadata | undefined> {
  const headers = { 'MCP-Protocol-Version': protocolVersion };

  const urlsToTry = buildDiscoveryUrls(authorizationServerUrl);

  for (const { url: endpointUrl, type } of urlsToTry) {
    const response = await fetchWithCorsRetry(endpointUrl, headers, fetchFn);

    if (!response) {
      /**
       * CORS error occurred - don't throw as the endpoint may not allow CORS,
       * continue trying other possible endpoints
       */
      continue;
    }

    if (!response.ok) {
      // Continue looking for any 4xx response code.
      if (response.status >= 400 && response.status < 500) {
        continue; // Try next URL
      }
      throw new Error(
        `HTTP ${response.status} trying to load ${type === 'oauth' ? 'OAuth' : 'OpenID provider'} metadata from ${endpointUrl}`,
      );
    }

    // Parse and validate based on type
    if (type === 'oauth') {
      return OAuthMetadataSchema.parse(await response.json());
    } else {
      const metadata = OpenIdProviderDiscoveryMetadataSchema.parse(
        await response.json(),
      );

      // MCP spec requires OIDC providers to support S256 PKCE
      if (!metadata.code_challenge_methods_supported?.includes('S256')) {
        throw new Error(
          `Incompatible OIDC provider at ${endpointUrl}: does not support S256 code challenge method required by MCP specification`,
        );
      }

      return metadata;
    }
  }

  return undefined;
}

export async function startAuthorization(
  authorizationServerUrl: string | URL,
  {
    metadata,
    clientInformation,
    redirectUrl,
    scope,
    state,
    resource,
  }: {
    metadata?: AuthorizationServerMetadata;
    clientInformation: OAuthClientInformation;
    redirectUrl: string | URL;
    scope?: string;
    state?: string;
    resource?: URL;
  },
): Promise<{ authorizationUrl: URL; codeVerifier: string }> {
  const responseType = 'code';
  const codeChallengeMethod = 'S256';

  let authorizationUrl: URL;
  if (metadata) {
    authorizationUrl = new URL(metadata.authorization_endpoint);

    if (!metadata.response_types_supported.includes(responseType)) {
      throw new Error(
        `Incompatible auth server: does not support response type ${responseType}`,
      );
    }

    if (
      !metadata.code_challenge_methods_supported ||
      !metadata.code_challenge_methods_supported.includes(codeChallengeMethod)
    ) {
      throw new Error(
        `Incompatible auth server: does not support code challenge method ${codeChallengeMethod}`,
      );
    }
  } else {
    authorizationUrl = new URL('/authorize', authorizationServerUrl);
  }

  // Generate PKCE challenge
  const challenge = await pkceChallenge();
  const codeVerifier = challenge.code_verifier;
  const codeChallenge = challenge.code_challenge;

  authorizationUrl.searchParams.set('response_type', responseType);
  authorizationUrl.searchParams.set('client_id', clientInformation.client_id);
  authorizationUrl.searchParams.set('code_challenge', codeChallenge);
  authorizationUrl.searchParams.set(
    'code_challenge_method',
    codeChallengeMethod,
  );
  authorizationUrl.searchParams.set('redirect_uri', String(redirectUrl));

  if (state) {
    authorizationUrl.searchParams.set('state', state);
  }

  if (scope) {
    authorizationUrl.searchParams.set('scope', scope);
  }

  if (scope?.includes('offline_access')) {
    // if the request includes the OIDC-only "offline_access" scope,
    // we need to set the prompt to "consent" to ensure the user is prompted to grant offline access
    // https://openid.net/specs/openid-connect-core-1_0.html#OfflineAccess
    authorizationUrl.searchParams.append('prompt', 'consent');
  }

  if (resource) {
    authorizationUrl.searchParams.set('resource', resource.href);
  }

  return { authorizationUrl, codeVerifier };
}
