import {
  auth,
  type OAuthAuthorizationServerInformation,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';
import assert from 'node:assert/strict';

const mcpServerUrl = 'https://mcp.example.com/mcp';
const workingPrmUrl = new URL(
  'https://mcp.example.com/mcp/.well-known/oauth-protected-resource',
);
const entraIssuer = 'https://login.example.com/tenant/v2.0';
const entraAuthorize = 'https://login.example.com/tenant/oauth2/v2.0/authorize';
const entraToken = 'https://login.example.com/tenant/oauth2/v2.0/token';
const entraDiscovery = `${entraIssuer}/.well-known/openid-configuration`;
const mismatchMessage =
  'OAuth authorization server metadata does not match the metadata that issued the stored credentials';
const reproductionSignal =
  'ISSUE_20774_REPRODUCED: callback rejected its stored authorization-server pin before token exchange';

async function main() {
  let authorizationServerInformation:
    | OAuthAuthorizationServerInformation
    | undefined;
  let savedTokens: OAuthTokens | undefined;
  let codeVerifier = 'initial-code-verifier';
  const tokenRequests: Array<{ url: string; body: URLSearchParams }> = [];

  const provider: OAuthClientProvider = {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: 'Issue 20774 reproduction',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => ({ client_id: 'test-client' }),
    tokens: () => undefined,
    saveTokens: tokens => {
      savedTokens = tokens;
    },
    saveCodeVerifier: value => {
      codeVerifier = value;
    },
    codeVerifier: () => codeVerifier,
    authorizationServerInformation: () => authorizationServerInformation,
    saveAuthorizationServerInformation: value => {
      authorizationServerInformation = value;
    },
    redirectToAuthorization: () => {},
  };

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );

    if (url.href === workingPrmUrl.href) {
      return Response.json({
        resource: mcpServerUrl,
        authorization_servers: [entraIssuer],
      });
    }

    if (url.pathname.includes('/.well-known/oauth-protected-resource')) {
      return new Response('unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }

    if (url.href === entraDiscovery) {
      return Response.json({
        issuer: entraIssuer,
        authorization_endpoint: entraAuthorize,
        token_endpoint: entraToken,
        jwks_uri: 'https://login.example.com/tenant/discovery/v2.0/keys',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['pairwise'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    }

    if (url.href === entraToken && init?.method === 'POST') {
      const body = new URLSearchParams(String(init.body));
      tokenRequests.push({ url: url.href, body });
      return Response.json({
        access_token: 'access-token',
        token_type: 'Bearer',
      });
    }

    return new Response(null, { status: 404 });
  };

  const connectResult = await auth(provider, {
    serverUrl: mcpServerUrl,
    resourceMetadataUrl: workingPrmUrl,
    fetchFn,
  });

  assert.equal(connectResult, 'REDIRECT');
  assert.deepEqual(authorizationServerInformation, {
    authorizationServerUrl: entraIssuer,
    tokenEndpoint: entraToken,
  });

  let callbackResult: Awaited<ReturnType<typeof auth>> | undefined;
  let callbackError: unknown;
  try {
    callbackResult = await auth(provider, {
      serverUrl: mcpServerUrl,
      authorizationCode: 'auth-code',
      fetchFn,
    });
  } catch (error) {
    callbackError = error;
  }

  if (
    callbackError instanceof Error &&
    callbackError.message === mismatchMessage &&
    tokenRequests.length === 0
  ) {
    throw new Error(reproductionSignal, { cause: callbackError });
  }

  if (callbackError !== undefined) {
    throw callbackError;
  }

  assert.equal(callbackResult, 'AUTHORIZED');
  assert.equal(tokenRequests.length, 1);
  assert.equal(tokenRequests[0].url, entraToken);
  assert.equal(tokenRequests[0].body.get('grant_type'), 'authorization_code');
  assert.equal(tokenRequests[0].body.get('code'), 'auth-code');
  assert.equal(tokenRequests[0].body.get('code_verifier'), codeVerifier);
  assert.equal(savedTokens?.access_token, 'access-token');
  assert.equal(savedTokens?.authorization_server, entraIssuer);
  assert.equal(savedTokens?.token_endpoint, entraToken);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
