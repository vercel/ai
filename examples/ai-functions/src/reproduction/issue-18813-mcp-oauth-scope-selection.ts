import {
  auth,
  createMCPClient,
  UnauthorizedError,
  type OAuthClientProvider,
} from '@ai-sdk/mcp';

const serverUrl = 'https://mcp.example.com/mcp';
const resourceMetadataUrl =
  'https://mcp.example.com/.well-known/oauth-protected-resource';
const authorizationServerUrl = 'https://auth.example.com';

function createProvider(onRedirect: (url: URL) => void): OAuthClientProvider {
  let clientInformation = { client_id: 'test-client' };

  return {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: 'Issue 18813 reproduction',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => clientInformation,
    saveClientInformation: value => {
      clientInformation = value;
    },
    tokens: () => undefined,
    saveTokens: () => {},
    saveCodeVerifier: () => {},
    codeVerifier: () => 'unused',
    redirectToAuthorization: onRedirect,
  };
}

function createOAuthFetch({
  challengeScope,
  protectedResourceScopes,
}: {
  challengeScope?: string;
  protectedResourceScopes: string[];
}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());

    if (url.href === serverUrl) {
      return new Response(null, {
        status: 401,
        headers: {
          'www-authenticate': [
            'Bearer',
            `resource_metadata="${resourceMetadataUrl}"`,
            challengeScope == null ? undefined : `scope="${challengeScope}"`,
          ]
            .filter(part => part != null)
            .join(', '),
        },
      });
    }

    if (url.pathname.includes('/.well-known/oauth-protected-resource')) {
      return Response.json({
        resource: serverUrl,
        authorization_servers: [authorizationServerUrl],
        scopes_supported: protectedResourceScopes,
      });
    }

    if (
      url.pathname.includes('/.well-known/oauth-authorization-server') ||
      url.pathname.includes('/.well-known/openid-configuration')
    ) {
      return Response.json({
        issuer: authorizationServerUrl,
        authorization_endpoint: `${authorizationServerUrl}/authorize`,
        token_endpoint: `${authorizationServerUrl}/token`,
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      });
    }

    throw new Error(
      `Unexpected request: ${init?.method ?? 'GET'} ${url.toString()}`,
    );
  };
}

async function getMetadataScope(): Promise<string | null> {
  let authorizationUrl: URL | undefined;
  const provider = createProvider(url => {
    authorizationUrl = url;
  });

  await auth(provider, {
    serverUrl,
    fetchFn: createOAuthFetch({
      protectedResourceScopes: ['mcp.read', 'mcp.write'],
    }),
  });

  return authorizationUrl?.searchParams.get('scope') ?? null;
}

async function getChallengeScope(): Promise<string | null> {
  let authorizationUrl: URL | undefined;
  const provider = createProvider(url => {
    authorizationUrl = url;
  });

  try {
    await createMCPClient({
      transport: {
        type: 'http',
        url: serverUrl,
        authProvider: provider,
        fetch: createOAuthFetch({
          challengeScope: 'mcp.challenge',
          protectedResourceScopes: ['mcp.metadata-default'],
        }),
      },
    });
    throw new Error('Expected the OAuth flow to redirect before MCP connects.');
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }
  }

  return authorizationUrl?.searchParams.get('scope') ?? null;
}

async function main() {
  const observed = {
    challengeScope: await getChallengeScope(),
    protectedResourceMetadataScope: await getMetadataScope(),
  };
  const expected = {
    challengeScope: 'mcp.challenge',
    protectedResourceMetadataScope: 'mcp.read mcp.write',
  };

  console.log(JSON.stringify({ observed, expected }, null, 2));

  if (
    observed.challengeScope !== expected.challengeScope ||
    observed.protectedResourceMetadataScope !==
      expected.protectedResourceMetadataScope
  ) {
    throw new Error(
      'ISSUE_18813_REPRODUCED: @ai-sdk/mcp omitted advertised scopes from the authorization URL.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
