import {
  auth,
  createMCPClient,
  UnauthorizedError,
  type OAuthClientInformation,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';

const serverUrl = 'https://mcp.example.com/mcp';
const resourceMetadataUrl =
  'https://mcp.example.com/.well-known/oauth-protected-resource';

function createProvider() {
  let authorizationUrl: URL | undefined;
  let clientInformation: OAuthClientInformation = {
    client_id: 'test-client',
  };

  const provider: OAuthClientProvider = {
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
    tokens: (): OAuthTokens | undefined => undefined,
    saveTokens: () => {},
    saveCodeVerifier: () => {},
    codeVerifier: () => 'unused',
    redirectToAuthorization: url => {
      authorizationUrl = url;
    },
  };

  return {
    provider,
    getAuthorizationUrl: () => authorizationUrl,
  };
}

function metadataResponse(url: URL): Response | undefined {
  if (url.pathname.includes('/.well-known/oauth-protected-resource')) {
    return Response.json({
      resource: serverUrl,
      authorization_servers: ['https://auth.example.com'],
      scopes_supported: ['mcp.read', 'mcp.write'],
    });
  }

  if (
    url.pathname.includes('/.well-known/oauth-authorization-server') ||
    url.pathname.includes('/.well-known/openid-configuration')
  ) {
    return Response.json({
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
    });
  }

  return undefined;
}

async function protectedResourceMetadataScope(): Promise<string | null> {
  const { provider, getAuthorizationUrl } = createProvider();

  await auth(provider, {
    serverUrl,
    fetchFn: async input => {
      const response = metadataResponse(new URL(input.toString()));
      if (response) return response;
      throw new Error(`Unexpected OAuth request: ${input.toString()}`);
    },
  });

  return getAuthorizationUrl()?.searchParams.get('scope') ?? null;
}

async function wwwAuthenticateScope(): Promise<string | null> {
  const { provider, getAuthorizationUrl } = createProvider();

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(input.toString());
    const method = init?.method ?? 'GET';

    if (url.href === serverUrl && method === 'GET') {
      return new Response(null, { status: 405 });
    }

    if (url.href === serverUrl && method === 'POST') {
      return new Response(null, {
        status: 401,
        headers: {
          'www-authenticate': `Bearer resource_metadata="${resourceMetadataUrl}", scope="mcp.challenge"`,
        },
      });
    }

    const response = metadataResponse(url);
    if (response) return response;
    throw new Error(`Unexpected MCP or OAuth request: ${method} ${url.href}`);
  };

  try {
    await createMCPClient({
      transport: {
        type: 'http',
        url: serverUrl,
        authProvider: provider,
        fetch: fetchFn,
      },
    });
    throw new Error('Expected MCP initialization to redirect for OAuth');
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }
  }

  return getAuthorizationUrl()?.searchParams.get('scope') ?? null;
}

async function main() {
  const [challengeScope, metadataScope] = await Promise.all([
    wwwAuthenticateScope(),
    protectedResourceMetadataScope(),
  ]);

  const failures: string[] = [];

  if (challengeScope !== 'mcp.challenge') {
    failures.push(
      `WWW-Authenticate expected "mcp.challenge", received ${JSON.stringify(challengeScope)}`,
    );
  }

  if (metadataScope !== 'mcp.read mcp.write') {
    failures.push(
      `Protected Resource Metadata expected "mcp.read mcp.write", received ${JSON.stringify(metadataScope)}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Issue #18813 reproduced: MCP authorization URL scope selection failed. ${failures.join('; ')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
