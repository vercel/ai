import {
  auth,
  type OAuthAuthorizationServerInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';
import assert from 'node:assert/strict';

const serverUrl = new URL('https://dashboard.starbridge.ai/mcp/oauth');
const resourceMetadataUrl = new URL(
  'https://dashboard.starbridge.ai/.well-known/oauth-protected-resource/internal/',
);
const authorizationServerMetadataUrl = new URL(
  'https://auth.starbridge.ai/.well-known/oauth-authorization-server',
);

const reportedError =
  'OAuth authorization server metadata issuer https://auth.starbridge.ai/ does not match expected issuer https://auth.starbridge.ai';
const failureSignal = `ISSUE_20236_REPRODUCED: ${reportedError}`;

class ReproductionOAuthProvider implements OAuthClientProvider {
  redirectedTo?: URL;
  savedAuthorizationServerInformation?: OAuthAuthorizationServerInformation;
  codeVerifierValue?: string;

  tokens(): OAuthTokens | undefined {
    return undefined;
  }

  saveTokens(): void {}

  redirectToAuthorization(authorizationUrl: URL): void {
    this.redirectedTo = authorizationUrl;
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.codeVerifierValue = codeVerifier;
  }

  codeVerifier(): string {
    assert.ok(this.codeVerifierValue);
    return this.codeVerifierValue;
  }

  get redirectUrl(): URL {
    return new URL('http://localhost:8090/callback');
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'AI SDK issue #20236 reproduction',
      redirect_uris: [this.redirectUrl.href],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  clientInformation() {
    return { client_id: 'issue-20236-reproduction' };
  }

  saveAuthorizationServerInformation(
    authorizationServerInformation: OAuthAuthorizationServerInformation,
  ): void {
    this.savedAuthorizationServerInformation = authorizationServerInformation;
  }
}

async function main() {
  const [resourceResponse, authorizationServerResponse] = await Promise.all([
    fetch(resourceMetadataUrl),
    fetch(authorizationServerMetadataUrl),
  ]);

  assert.equal(resourceResponse.status, 200);
  assert.equal(authorizationServerResponse.status, 200);

  const resourceMetadata = (await resourceResponse.json()) as {
    authorization_servers?: string[];
  };
  const authorizationServerMetadata =
    (await authorizationServerResponse.json()) as { issuer?: string };

  const advertisedAuthorizationServer =
    resourceMetadata.authorization_servers?.[0];
  assert.equal(advertisedAuthorizationServer, 'https://auth.starbridge.ai/');
  assert.equal(
    authorizationServerMetadata.issuer,
    advertisedAuthorizationServer,
    'The protected-resource and authorization-server documents must identify the same issuer.',
  );

  const provider = new ReproductionOAuthProvider();

  try {
    const result = await auth(provider, {
      serverUrl,
      resourceMetadataUrl,
    });

    assert.equal(
      result,
      'REDIRECT',
      'A consistent authorization server should start browser authorization.',
    );
    assert.equal(provider.redirectedTo?.origin, 'https://auth.starbridge.ai');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(reportedError)) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
