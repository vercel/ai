import {
  auth,
  type OAuthClientInformation,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';

type Scenario = {
  name: string;
  challengeScope?: string;
  resourceScopes?: string[];
  expectedScope?: string;
};

type ScenarioResult = {
  name: string;
  dcrScope?: string;
  authorizationScope?: string;
  tokenScope?: string;
  resourceStatus: number;
};

async function runScenario({
  name,
  challengeScope,
  resourceScopes,
  expectedScope,
}: Scenario): Promise<ScenarioResult> {
  const serverUrl = 'https://mcp.example.com/mcp';
  let clientInformation: OAuthClientInformation | undefined;
  let tokens: OAuthTokens | undefined;
  let codeVerifier = '';
  let authorizationUrl: URL | undefined;
  let dcrBody: Record<string, unknown> | undefined;
  let registeredScope: string | undefined;

  const provider: OAuthClientProvider = {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: `Issue 19496 ${name}`,
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => clientInformation,
    saveClientInformation: information => {
      clientInformation = information;
    },
    tokens: () => tokens,
    saveTokens: value => {
      tokens = value;
    },
    saveCodeVerifier: value => {
      codeVerifier = value;
    },
    codeVerifier: () => codeVerifier,
    redirectToAuthorization: url => {
      authorizationUrl = url;
    },
  };

  const fetchFn = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(input.toString());

    if (url.pathname.includes('/.well-known/oauth-protected-resource')) {
      return Response.json({
        resource: serverUrl,
        authorization_servers: ['https://auth.example.com'],
        ...(resourceScopes == null ? {} : { scopes_supported: resourceScopes }),
      });
    }

    if (url.pathname.includes('/.well-known/oauth-authorization-server')) {
      return Response.json({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
      });
    }

    if (url.pathname === '/register' && init?.method === 'POST') {
      dcrBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      registeredScope =
        typeof dcrBody.scope === 'string'
          ? dcrBody.scope
          : 'preview:agent-interface';

      return Response.json({
        ...dcrBody,
        client_id: `test-client-${name}`,
        client_id_issued_at: 1,
      });
    }

    if (url.pathname === '/token' && init?.method === 'POST') {
      return Response.json({
        access_token: `test-token-${name}`,
        token_type: 'Bearer',
        scope: registeredScope,
      });
    }

    if (url.pathname === '/mcp/tools') {
      const grantedScopes = new Set(tokens?.scope?.split(' ') ?? []);
      const requiredScopes = expectedScope?.split(' ') ?? [];
      const hasRequiredScopes = requiredScopes.every(scope =>
        grantedScopes.has(scope),
      );

      return hasRequiredScopes
        ? Response.json({ tools: [] })
        : Response.json({ error: 'scope does not match' }, { status: 401 });
    }

    return new Response(null, { status: 404 });
  };

  const initialResult = await auth(provider, {
    serverUrl,
    scope: challengeScope,
    fetchFn,
  });
  if (initialResult !== 'REDIRECT') {
    throw new Error(`${name}: expected the initial OAuth result to redirect`);
  }
  if (authorizationUrl == null) {
    throw new Error(`${name}: authorization redirect URL was not captured`);
  }

  const authorizationScope =
    authorizationUrl.searchParams.get('scope') ?? undefined;
  if (authorizationScope !== expectedScope) {
    throw new Error(
      `${name}: authorization scope was ${String(authorizationScope)}, expected ${String(expectedScope)}`,
    );
  }

  const callbackResult = await auth(provider, {
    serverUrl,
    authorizationCode: `test-code-${name}`,
    fetchFn,
  });
  if (callbackResult !== 'AUTHORIZED') {
    throw new Error(`${name}: expected the OAuth callback to authorize`);
  }

  const resourceResponse = await fetchFn('https://mcp.example.com/mcp/tools', {
    headers: {
      Authorization: `Bearer ${tokens?.access_token}`,
    },
  });

  return {
    name,
    dcrScope: typeof dcrBody?.scope === 'string' ? dcrBody.scope : undefined,
    authorizationScope,
    tokenScope: tokens?.scope,
    resourceStatus: resourceResponse.status,
  };
}

async function main(): Promise<void> {
  const results = await Promise.all([
    runScenario({
      name: 'www-authenticate-scope',
      challengeScope: 'mcp.challenge',
      resourceScopes: ['mcp.read', 'mcp.write'],
      expectedScope: 'mcp.challenge',
    }),
    runScenario({
      name: 'protected-resource-metadata-scopes',
      resourceScopes: ['mcp.read', 'mcp.write'],
      expectedScope: 'mcp.read mcp.write',
    }),
    runScenario({
      name: 'no-discovered-scope',
    }),
  ]);

  for (const result of results) {
    console.log(
      JSON.stringify({
        scenario: result.name,
        dcrScope: result.dcrScope,
        authorizationScope: result.authorizationScope,
        tokenScope: result.tokenScope,
        resourceStatus: result.resourceStatus,
      }),
    );
  }

  const noScopeResult = results.find(
    result => result.name === 'no-discovered-scope',
  );
  if (
    noScopeResult?.dcrScope !== undefined ||
    noScopeResult.authorizationScope !== undefined
  ) {
    throw new Error(
      'no-discovered-scope: expected both DCR and authorization to omit scope',
    );
  }

  const prmResult = results.find(
    result => result.name === 'protected-resource-metadata-scopes',
  );
  if (
    prmResult?.dcrScope === undefined &&
    prmResult.authorizationScope === 'mcp.read mcp.write' &&
    prmResult.resourceStatus === 401
  ) {
    throw new Error(
      'Issue #19496 reproduced: DCR omitted PRM scope, so the MCP resource rejected the issued token with 401 scope does not match',
    );
  }

  for (const result of results) {
    if (
      result.dcrScope !== result.authorizationScope ||
      result.resourceStatus !== 200
    ) {
      throw new Error(
        `${result.name}: DCR and authorization scope selection were inconsistent`,
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
