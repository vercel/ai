import {
  createMCPClient,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';

type Timing = 'single-request control' | 'simultaneous' | 'after-save';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runScenario({
  timing,
  requests,
}: {
  timing: Timing;
  requests: number;
}): Promise<{ refreshes: number }> {
  const serverUrl = 'https://mcp.test/';
  const endpointUrl = `${serverUrl}messages`;
  const authorizationServerUrl = 'https://auth.test/';
  const tokenEndpoint = `${authorizationServerUrl}token`;

  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let tokens: OAuthTokens = {
    access_token: 'access-old',
    refresh_token: 'refresh-stable',
    token_type: 'Bearer',
    authorization_server: authorizationServerUrl,
    token_endpoint: tokenEndpoint,
  };
  let validAccessToken = tokens.access_token;
  let refreshes = 0;
  let oldTokenRequests = 0;
  const firstRefreshSaved = deferred<void>();
  const bothOldTokenRequestsStarted = deferred<void>();
  const encoder = new TextEncoder();

  const provider: OAuthClientProvider = {
    tokens: () => tokens,
    saveTokens: nextTokens => {
      tokens = nextTokens;
      firstRefreshSaved.resolve();
    },
    redirectToAuthorization: () => undefined,
    saveCodeVerifier: () => undefined,
    codeVerifier: () => 'verifier',
    redirectUrl: 'https://app.test/oauth/callback',
    clientMetadata: {
      redirect_uris: ['https://app.test/oauth/callback'],
    },
    clientInformation: () => ({ client_id: 'client' }),
  };

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);

    if (request.url === serverUrl && request.method === 'GET') {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(
            encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`),
          );
        },
      });
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    if (request.url.endsWith('/.well-known/oauth-protected-resource')) {
      return Response.json({
        resource: serverUrl,
        authorization_servers: [authorizationServerUrl],
      });
    }

    if (
      request.url ===
      `${authorizationServerUrl}.well-known/oauth-authorization-server`
    ) {
      return Response.json({
        issuer: authorizationServerUrl,
        authorization_endpoint: `${authorizationServerUrl}authorize`,
        token_endpoint: tokenEndpoint,
        response_types_supported: ['code'],
        grant_types_supported: ['refresh_token'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    }

    if (request.url === tokenEndpoint && request.method === 'POST') {
      if (timing === 'simultaneous') {
        await bothOldTokenRequestsStarted.promise;
      }
      refreshes += 1;
      validAccessToken = `access-${refreshes}`;
      return Response.json({
        access_token: validAccessToken,
        refresh_token: 'refresh-stable',
        token_type: 'Bearer',
      });
    }

    if (request.url === endpointUrl && request.method === 'POST') {
      if (
        request.headers.get('authorization') !== `Bearer ${validAccessToken}`
      ) {
        oldTokenRequests += 1;
        if (oldTokenRequests >= 2) {
          bothOldTokenRequestsStarted.resolve();
        }
        if (timing === 'after-save' && oldTokenRequests === 2) {
          await firstRefreshSaved.promise;
        }
        return new Response(null, { status: 401 });
      }

      const message: unknown = await request.json();
      if (
        typeof message === 'object' &&
        message !== null &&
        'id' in message &&
        (typeof message.id === 'string' || typeof message.id === 'number')
      ) {
        const result =
          'method' in message && message.method === 'initialize'
            ? {
                protocolVersion: '2024-11-05',
                capabilities: { resources: {} },
                serverInfo: { name: 'fake', version: '1' },
              }
            : { resources: [] };

        streamController?.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              jsonrpc: '2.0',
              id: message.id,
              result,
            })}\n\n`,
          ),
        );
      }
      return new Response(null, { status: 202 });
    }

    return new Response(null, { status: 404 });
  };

  const client = await createMCPClient({
    transport: {
      type: 'sse',
      url: serverUrl,
      authProvider: provider,
      fetch: fakeFetch,
    },
  });

  validAccessToken = 'access-invalidated';

  try {
    const results = await Promise.all(
      Array.from({ length: requests }, () => client.listResources()),
    );
    const expectedResults = Array.from({ length: requests }, () => ({
      resources: [],
    }));
    assert(
      JSON.stringify(results) === JSON.stringify(expectedResults),
      `${timing}: resource calls did not all succeed`,
    );
    return { refreshes };
  } finally {
    await client.close();
  }
}

async function main() {
  const control = await runScenario({
    timing: 'single-request control',
    requests: 1,
  });
  const simultaneous = await runScenario({
    timing: 'simultaneous',
    requests: 2,
  });
  const afterSave = await runScenario({
    timing: 'after-save',
    requests: 2,
  });

  assert(
    control.refreshes === 1,
    `control expected one OAuth refresh, received ${control.refreshes}`,
  );

  console.log(
    JSON.stringify({
      control: control.refreshes,
      simultaneous: simultaneous.refreshes,
      afterSave: afterSave.refreshes,
    }),
  );

  if (simultaneous.refreshes > 1 || afterSave.refreshes > 1) {
    throw new Error(
      'ISSUE_20940_REPRODUCED: legacy SSE performed more than one OAuth refresh for a 401 race',
    );
  }

  assert(
    simultaneous.refreshes === 1,
    `simultaneous expected one OAuth refresh, received ${simultaneous.refreshes}`,
  );
  assert(
    afterSave.refreshes === 1,
    `after-save expected one OAuth refresh, received ${afterSave.refreshes}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
