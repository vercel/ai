import {
  auth,
  type OAuthAuthorizationServerInformation,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';
import assert from 'node:assert/strict';

async function main() {
  const mcpServerUrl = 'https://mcp.example.com/mcp';
  const workingPrmUrl = new URL(
    'https://mcp.example.com/mcp/.well-known/oauth-protected-resource',
  );
  const authorizationServerUrl = 'https://login.example.com/tenant/v2.0';
  const authorizationEndpoint =
    'https://login.example.com/tenant/oauth2/v2.0/authorize';
  const tokenEndpoint = 'https://login.example.com/tenant/oauth2/v2.0/token';

  let storedAuthorizationServerInformation:
    | OAuthAuthorizationServerInformation
    | undefined;
  let storedTokens: OAuthTokens | undefined;
  let codeVerifier = 'code-verifier';
  const tokenRequests: Array<{ url: string; body: string }> = [];

  const provider: OAuthClientProvider = {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: 'Issue 20774 reproduction',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => ({ client_id: 'test-client' }),
    tokens: () => storedTokens,
    saveTokens: tokens => {
      storedTokens = tokens;
    },
    saveCodeVerifier: value => {
      codeVerifier = value;
    },
    codeVerifier: () => codeVerifier,
    authorizationServerInformation: () => storedAuthorizationServerInformation,
    saveAuthorizationServerInformation: value => {
      storedAuthorizationServerInformation = value;
    },
    redirectToAuthorization: () => {},
  };

  const getUrl = (input: RequestInfo | URL) =>
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  const fetchFn = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(getUrl(input));

    if (url.href === workingPrmUrl.href) {
      return Response.json({
        resource: mcpServerUrl,
        authorization_servers: [authorizationServerUrl],
      });
    }

    if (url.pathname.includes('/.well-known/oauth-protected-resource')) {
      return new Response('unauthorized', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    }

    if (
      url.href === `${authorizationServerUrl}/.well-known/openid-configuration`
    ) {
      return Response.json({
        issuer: authorizationServerUrl,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        jwks_uri: 'https://login.example.com/tenant/discovery/v2.0/keys',
        response_types_supported: ['code'],
        subject_types_supported: ['pairwise'],
        id_token_signing_alg_values_supported: ['RS256'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
      });
    }

    if (url.href === tokenEndpoint && init?.method === 'POST') {
      tokenRequests.push({
        url: url.href,
        body: String(init.body),
      });
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
  assert.deepEqual(storedAuthorizationServerInformation, {
    issuer: authorizationServerUrl,
    authorizationServerUrl,
    tokenEndpoint,
  });

  try {
    const callbackResult = await auth(provider, {
      serverUrl: mcpServerUrl,
      authorizationCode: 'auth-code',
      resourceMetadataUrl:
        process.env.ISSUE_20774_CONTROL_USE_PRM === '1'
          ? workingPrmUrl
          : undefined,
      fetchFn,
    });

    assert.equal(callbackResult, 'AUTHORIZED');
    assert.equal(tokenRequests.length, 1);
    assert.equal(tokenRequests[0].url, tokenEndpoint);
    assert.equal(
      new URLSearchParams(tokenRequests[0].body).get('code'),
      'auth-code',
    );
    assert.equal(storedTokens?.access_token, 'access-token');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        'OAuth authorization server metadata does not match the metadata that issued the stored credentials',
      ) &&
      tokenRequests.length === 0
    ) {
      console.error(
        'ISSUE_20774_REPRODUCED: authorization callback rejected the stored authorization server before token exchange',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
