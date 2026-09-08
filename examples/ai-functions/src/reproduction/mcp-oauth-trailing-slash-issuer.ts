import {
  auth,
  type OAuthAuthorizationServerInformation,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';

const serverUrl = new URL('https://dashboard.starbridge.ai/mcp/oauth');
const protectedResourceMetadataUrl = new URL(
  'https://dashboard.starbridge.ai/.well-known/oauth-protected-resource',
);
const authorizationServerMetadataUrl = new URL(
  'https://auth.starbridge.ai/.well-known/oauth-authorization-server',
);

class ReproductionOAuthProvider implements OAuthClientProvider {
  private authorizationServer?: OAuthAuthorizationServerInformation;
  private verifier?: string;
  redirectedTo?: URL;

  readonly redirectUrl = 'http://localhost:3000/callback';
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'AI SDK issue #20236 reproduction',
    redirect_uris: [this.redirectUrl],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };

  tokens(): OAuthTokens | undefined {
    return undefined;
  }

  saveTokens(): void {}

  redirectToAuthorization(authorizationUrl: URL): void {
    this.redirectedTo = authorizationUrl;
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.verifier) {
      throw new Error('Authorization did not save a PKCE verifier.');
    }
    return this.verifier;
  }

  clientInformation(): OAuthClientInformation {
    return { client_id: 'issue-20236-reproduction' };
  }

  authorizationServerInformation():
    | OAuthAuthorizationServerInformation
    | undefined {
    return this.authorizationServer;
  }

  saveAuthorizationServerInformation(
    information: OAuthAuthorizationServerInformation,
  ): void {
    this.authorizationServer = information;
  }
}

async function fetchJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Live metadata request failed with HTTP ${response.status}.`,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const [protectedResourceMetadata, authorizationServerMetadata] =
    await Promise.all([
      fetchJson(protectedResourceMetadataUrl),
      fetchJson(authorizationServerMetadataUrl),
    ]);

  const advertisedAuthorizationServer = (
    protectedResourceMetadata.authorization_servers as unknown[]
  )?.[0];
  const metadataIssuer = authorizationServerMetadata.issuer;

  if (
    advertisedAuthorizationServer !== 'https://auth.starbridge.ai/' ||
    metadataIssuer !== advertisedAuthorizationServer
  ) {
    throw new Error(
      'Live Starbridge metadata no longer matches the issue #20236 scenario.',
    );
  }

  const provider = new ReproductionOAuthProvider();

  let result: Awaited<ReturnType<typeof auth>>;
  try {
    result = await auth(provider, { serverUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes(
        'metadata issuer https://auth.starbridge.ai/ does not match expected issuer https://auth.starbridge.ai',
      )
    ) {
      throw new Error(
        'ISSUE_20236_REPRODUCED: @ai-sdk/mcp rejected internally consistent origin-only issuer https://auth.starbridge.ai/ before OAuth redirect.',
      );
    }
    throw error;
  }

  if (result !== 'REDIRECT' || provider.redirectedTo == null) {
    throw new Error(
      'OAuth initiation did not return REDIRECT with an authorization URL.',
    );
  }

  console.log(
    'Issue #20236 did not reproduce: OAuth initiation accepted the trailing-slash issuer.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
