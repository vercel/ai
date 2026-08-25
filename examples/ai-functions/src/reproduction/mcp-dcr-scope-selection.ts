import { auth, type OAuthClientProvider } from '@ai-sdk/mcp';

type Scenario = {
  name: string;
  challengeScope?: string;
  prmScopes?: string[];
  expectedScope?: string;
};

type ScenarioResult = {
  name: string;
  dcrScope?: string;
  authorizationScope?: string;
  resourceStatus: number;
};

async function runScenario({
  name,
  challengeScope,
  prmScopes,
  expectedScope,
}: Scenario): Promise<ScenarioResult> {
  let dcrBody: Record<string, unknown> | undefined;
  let authorizationUrl: URL | undefined;

  const provider: OAuthClientProvider = {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: 'MCP DCR scope reproduction',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'none',
    },
    clientInformation: () => undefined,
    saveClientInformation: () => {},
    tokens: () => undefined,
    saveTokens: () => {},
    saveCodeVerifier: () => {},
    codeVerifier: () => 'unused',
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
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://auth.example.com'],
        ...(prmScopes === undefined ? {} : { scopes_supported: prmScopes }),
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
      return Response.json({
        ...dcrBody,
        client_id: `client-${name}`,
        client_id_issued_at: 1,
      });
    }

    return new Response(null, { status: 404 });
  };

  const authResult = await auth(provider, {
    serverUrl: 'https://mcp.example.com/mcp',
    scope: challengeScope,
    fetchFn,
  });

  if (authResult !== 'REDIRECT' || authorizationUrl === undefined) {
    throw new Error(`${name}: OAuth flow did not reach authorization redirect`);
  }

  const authorizationScope = authorizationUrl.searchParams.get('scope');
  const dcrScope =
    typeof dcrBody?.scope === 'string' ? dcrBody.scope : undefined;

  // Model an RFC 7591 server that limits later grants to the scopes declared
  // during registration and otherwise assigns an incompatible default scope.
  const registeredScopes = new Set(
    (dcrScope ?? 'preview:agent-interface').split(' '),
  );
  const grantedScopes = new Set(
    authorizationScope
      ?.split(' ')
      .filter(scope => registeredScopes.has(scope)) ?? registeredScopes,
  );
  const requiredScopes = expectedScope?.split(' ') ?? [];
  const resourceStatus = requiredScopes.every(scope => grantedScopes.has(scope))
    ? 200
    : 401;

  return {
    name,
    dcrScope,
    authorizationScope: authorizationScope ?? undefined,
    resourceStatus,
  };
}

async function main() {
  const scenarios: Scenario[] = [
    {
      name: 'challenge scope takes precedence',
      challengeScope: 'mcp.challenge',
      prmScopes: ['mcp.read', 'mcp.write'],
      expectedScope: 'mcp.challenge',
    },
    {
      name: 'protected resource metadata scopes',
      prmScopes: ['mcp.read', 'mcp.write'],
      expectedScope: 'mcp.read mcp.write',
    },
    {
      name: 'no discovered scope',
    },
  ];

  const results = await Promise.all(scenarios.map(runScenario));

  for (const result of results) {
    console.log(
      `${result.name}: DCR=${String(result.dcrScope)}, authorize=${String(
        result.authorizationScope,
      )}, resource=${result.resourceStatus}`,
    );
  }

  const inaccessible = results.filter(result => result.resourceStatus === 401);
  if (inaccessible.length > 0) {
    throw new Error(
      'MCP DCR scope selection bug: dynamically registered client cannot access the MCP resource (HTTP 401)',
    );
  }

  for (const [index, result] of results.entries()) {
    const expectedScope = scenarios[index].expectedScope;
    if (
      result.dcrScope !== expectedScope ||
      result.authorizationScope !== expectedScope
    ) {
      throw new Error(
        `${result.name}: expected DCR and authorization scope ${String(
          expectedScope,
        )}`,
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
