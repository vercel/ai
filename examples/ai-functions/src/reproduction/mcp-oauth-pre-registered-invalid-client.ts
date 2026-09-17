import { auth, type OAuthClientProvider } from '@ai-sdk/mcp';

const mcpServerUrl = 'https://mcp.example.com/mcp';
const authorizationServerUrl = 'https://as.example.com';
const tokenUrl = `${authorizationServerUrl}/oauth/token`;
const invalidClientDescription = 'This is an invalid client.';

type ClientInformation = {
  client_id: string;
  client_secret: string;
};

function createFetch({
  onRegistration,
}: {
  onRegistration?: () => void;
} = {}): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url.includes('/.well-known/oauth-protected-resource')) {
      return Response.json({
        resource: mcpServerUrl,
        authorization_servers: [authorizationServerUrl],
      });
    }

    if (url.includes('/.well-known/oauth-authorization-server')) {
      return Response.json({
        issuer: authorizationServerUrl,
        authorization_endpoint: `${authorizationServerUrl}/authorize`,
        token_endpoint: tokenUrl,
        registration_endpoint: `${authorizationServerUrl}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      });
    }

    if (url === tokenUrl && init?.method === 'POST') {
      return Response.json(
        {
          error: 'invalid_client',
          error_description: invalidClientDescription,
        },
        { status: 401 },
      );
    }

    if (url === `${authorizationServerUrl}/register`) {
      onRegistration?.();
      return Response.json({
        client_id: 'dynamically-registered-client',
        redirect_uris: ['https://client.example.com/callback'],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };
}

function isInvalidClientError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.constructor.name === 'InvalidClientError' &&
    (error.constructor as { errorCode?: string }).errorCode ===
      'invalid_client' &&
    error.message === invalidClientDescription
  );
}

async function reproduceAuthorizationCodeExchange() {
  const staticClient: ClientInformation = {
    client_id: 'static-client',
    client_secret: 'wrong-secret',
  };
  let clientInformation: ClientInformation | undefined = staticClient;
  let invalidationScope: string | undefined;
  let thrown: unknown;

  const provider: OAuthClientProvider = {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: 'Reproduction',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'client_secret_post',
    },
    clientInformation: () => clientInformation,
    saveClientInformation: value => {
      clientInformation = value as ClientInformation;
    },
    tokens: () => undefined,
    saveTokens: () => {},
    saveCodeVerifier: () => {},
    codeVerifier: () => 'code-verifier',
    authorizationServerInformation: () => ({
      authorizationServerUrl,
      tokenEndpoint: tokenUrl,
    }),
    saveAuthorizationServerInformation: () => {},
    invalidateCredentials: async scope => {
      invalidationScope = scope;
      if (scope === 'all' || scope === 'client') {
        clientInformation = undefined;
      }
    },
    redirectToAuthorization: () => {
      throw new Error('Should not redirect during authorization-code exchange');
    },
  };

  try {
    await auth(provider, {
      serverUrl: mcpServerUrl,
      authorizationCode: 'auth-code',
      fetchFn: createFetch(),
    });
  } catch (error) {
    thrown = error;
  }

  return {
    originalErrorPreserved: isInvalidClientError(thrown),
    staticClientPreserved: clientInformation === staticClient,
    credentialsNotInvalidated: invalidationScope === undefined,
    observedError:
      thrown instanceof Error
        ? `${thrown.constructor.name}: ${thrown.message}`
        : String(thrown),
    invalidationScope,
  };
}

async function reproduceFreshAuthWithStaticClient() {
  const staticClient: ClientInformation = {
    client_id: 'static-client',
    client_secret: 'wrong-secret',
  };
  let clientInformation: ClientInformation | undefined = staticClient;
  let tokens:
    | {
        access_token: string;
        token_type: 'Bearer';
        refresh_token: string;
        authorization_server: string;
        token_endpoint: string;
      }
    | undefined = {
    access_token: 'expired-token',
    token_type: 'Bearer',
    refresh_token: 'refresh-token',
    authorization_server: `${authorizationServerUrl}/`,
    token_endpoint: tokenUrl,
  };
  let invalidationScope: string | undefined;
  let registrationAttempted = false;
  let thrown: unknown;

  const provider: OAuthClientProvider = {
    redirectUrl: 'https://client.example.com/callback',
    clientMetadata: {
      client_name: 'Reproduction',
      redirect_uris: ['https://client.example.com/callback'],
      token_endpoint_auth_method: 'client_secret_post',
    },
    clientInformation: () => clientInformation,
    saveClientInformation: value => {
      clientInformation = value as ClientInformation;
    },
    tokens: () => tokens,
    saveTokens: () => {},
    saveCodeVerifier: () => {},
    codeVerifier: () => 'code-verifier',
    authorizationServerInformation: () => ({
      authorizationServerUrl,
      tokenEndpoint: tokenUrl,
    }),
    saveAuthorizationServerInformation: () => {},
    invalidateCredentials: async scope => {
      invalidationScope = scope;
      if (scope === 'all' || scope === 'client') {
        clientInformation = undefined;
      }
      if (scope === 'all' || scope === 'tokens') {
        tokens = undefined;
      }
    },
    redirectToAuthorization: () => {},
  };

  try {
    await auth(provider, {
      serverUrl: mcpServerUrl,
      fetchFn: createFetch({
        onRegistration: () => {
          registrationAttempted = true;
        },
      }),
    });
  } catch (error) {
    thrown = error;
  }

  return {
    originalErrorPreserved: isInvalidClientError(thrown),
    staticClientPreserved: clientInformation === staticClient,
    credentialsNotInvalidated: invalidationScope === undefined,
    registrationNotAttempted: !registrationAttempted,
    observedError:
      thrown instanceof Error
        ? `${thrown.constructor.name}: ${thrown.message}`
        : String(thrown),
    invalidationScope,
    registrationAttempted,
  };
}

async function main() {
  const codeExchange = await reproduceAuthorizationCodeExchange();
  const freshAuth = await reproduceFreshAuthWithStaticClient();

  const codeExchangePasses =
    codeExchange.originalErrorPreserved &&
    codeExchange.staticClientPreserved &&
    codeExchange.credentialsNotInvalidated;
  const freshAuthPasses =
    freshAuth.originalErrorPreserved &&
    freshAuth.staticClientPreserved &&
    freshAuth.credentialsNotInvalidated &&
    freshAuth.registrationNotAttempted;

  if (!codeExchangePasses || !freshAuthPasses) {
    console.error(
      JSON.stringify(
        {
          codeExchange,
          freshAuth,
        },
        null,
        2,
      ),
    );
    throw new Error(
      'ISSUE #21020: invalid_client was masked during code exchange and pre-registered OAuth client credentials were invalidated',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
