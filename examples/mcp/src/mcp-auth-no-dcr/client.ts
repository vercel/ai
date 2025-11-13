import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { experimental_createMCPClient, auth } from '@ai-sdk/mcp';
import 'dotenv/config';
import type {
  OAuthClientProvider,
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '@ai-sdk/mcp';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';

/**
 * PRE-REGISTERED OAUTH CLIENT EXAMPLE (NO DCR)
 *
 * This example demonstrates how to use OAuth with pre-registered client credentials
 * WITHOUT Dynamic Client Registration (DCR).
 *
 * KEY DIFFERENCES from the mcp-with-auth example:
 *
 * 1. CLIENT CREDENTIALS ARE PROVIDED UPFRONT:
 *    - The client_id and client_secret are pre-configured (see environment variables)
 *    - You must register your OAuth client with the authorization server BEFORE running this
 *
 * 2. NO DYNAMIC REGISTRATION:
 *    - clientInformation() returns pre-registered credentials immediately
 *    - saveClientInformation() is optional (not used in this flow)
 *    - The auth flow skips the DCR step entirely
 *
 * 3. USE CASES:
 *    - Enterprise environments where DCR is disabled
 *    - Legacy authorization servers without DCR support
 *    - Scenarios requiring pre-approved client credentials
 *
 * REQUIRED ENVIRONMENT VARIABLES:
 * - OAUTH_CLIENT_ID: Your pre-registered client ID
 * - OAUTH_CLIENT_SECRET: Your pre-registered client secret (optional for public clients)
 * - MCP_CALLBACK_PORT: Port for OAuth callback (default: 8090)
 */

class PreRegisteredOAuthClientProvider implements OAuthClientProvider {
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _redirectUrl: string | URL =
    `http://localhost:${process.env.MCP_CALLBACK_PORT ?? 8090}/callback`;

  // PRE-REGISTERED CLIENT CREDENTIALS from environment variables
  private _clientInformation: OAuthClientInformation = {
    client_id: process.env.OAUTH_CLIENT_ID || 'your-pre-registered-client-id',
    client_secret: process.env.OAUTH_CLIENT_SECRET, // Optional for public clients
  };

  // Optional: Override the resource/audience for the OAuth flow
  private _audience?: string;

  constructor(options?: { audience?: string }) {
    this._audience = options?.audience;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.log('\n=== Authorization URL ===');
    console.log(authorizationUrl.toString());
    console.log('\nOpening browser for authorization...\n');
    
    const cmd =
      process.platform === 'win32'
        ? `start ${authorizationUrl.toString()}`
        : process.platform === 'darwin'
          ? `open "${authorizationUrl.toString()}"`
          : `xdg-open "${authorizationUrl.toString()}"`;
    exec(cmd, error => {
      if (error) {
        console.error(
          'Failed to open browser automatically. Open this URL manually:',
          authorizationUrl.toString(),
        );
      }
    });
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this._codeVerifier) throw new Error('No code verifier saved');
    return this._codeVerifier;
  }

  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'AI SDK MCP Pre-Registered Client Example',
      redirect_uris: [String(this._redirectUrl)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: 'report:personal-data'
    };
  }

  /**
   * KEY METHOD: Returns pre-registered client credentials
   *
   * Unlike the DCR example which returns undefined here (triggering dynamic registration),
   * this returns the pre-configured credentials immediately, skipping DCR entirely.
   */
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this._clientInformation;
  }

  /**
   * Optional: Override the resource/audience for OAuth
   * This is useful for services like Atlassian that require specific audience values
   */
  async validateResourceURL(
    serverUrl: string | URL,
    resource?: string,
  ): Promise<URL | undefined> {
    if (this._audience) {
      // Ensure the audience has a protocol
      const audienceUrl = this._audience.startsWith('http')
        ? this._audience
        : `https://${this._audience}`;
      return new URL(audienceUrl);
    }
    return resource ? new URL(resource) : undefined;
  }

  /**
   * Below function is not needed for pre-registered clients
   * async saveClientInformation(info: OAuthClientInformation): Promise<void>
   */

  /**
   * Note: We don't invalidate client credentials since they're pre-registered
   * async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier')
   */
}

async function authorizeWithPkceOnce(
  authProvider: OAuthClientProvider,
  serverUrl: string,
  waitForCode: () => Promise<string>,
): Promise<void> {
  const result = await auth(authProvider, { serverUrl: new URL(serverUrl) });
  if (result !== 'AUTHORIZED') {
    const authorizationCode = await waitForCode();
    await auth(authProvider, {
      serverUrl: new URL(serverUrl),
      authorizationCode,
    });
  }
}

function waitForAuthorizationCode(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400).end('Bad request');
        return;
      }
      const url = new URL(req.url, `http://localhost:${port}`);
      
      // Log the full callback URL for debugging
      console.log('\n=== OAuth Callback Received ===');
      console.log('Full URL:', url.toString());
      console.log('Query params:', Object.fromEntries(url.searchParams));
      
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      const errorUri = url.searchParams.get('error_uri');
      
      if (code) {
        console.log('✓ Authorization code received successfully\n');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>',
        );
        setTimeout(() => server.close(), 100);
        resolve(code);
      } else {
        // Enhanced error logging
        console.error('\n✗ Authorization failed:');
        console.error('  Error:', err ?? 'missing code');
        if (errorDescription) {
          console.error('  Description:', errorDescription);
        }
        if (errorUri) {
          console.error('  More info:', errorUri);
        }
        console.error('\n');
        
        const errorMsg = errorDescription || err || 'missing code';
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(
          `<html><body><h1>Authorization Failed</h1><p>${errorMsg}</p></body></html>`,
        );
        setTimeout(() => server.close(), 100);
        reject(new Error(`Authorization failed: ${errorMsg}`));
      }
    });
    server.listen(port, () => {
      console.log(`OAuth callback: http://localhost:${port}/callback`);
    });
  });
}

async function main() {
  console.log('=== MCP OAuth Example: Pre-Registered Client (No DCR) ===\n');

  // FOR ATLASSIAN MCP SERVER:
  // - Authorization Server: https://auth.atlassian.com
  // - MCP Server: https://mcp.atlassian.com/v1/sse
  // - Audience: api.atlassian.com
  // - Scope: report:personal-data (or other Atlassian scopes)
  
  const authProvider = new PreRegisteredOAuthClientProvider({
    audience: 'api.atlassian.com',  // Required for Atlassian
  });
  
  // Use the auth server URL for discovery (not the MCP server URL)
  const authServerUrl = 'https://auth.atlassian.com';
  const mcpServerUrl = 'https://mcp.atlassian.com/v1/sse';

  console.log('Using pre-registered client credentials:');
  console.log(
    `  Client ID: ${process.env.OAUTH_CLIENT_ID || 'your-pre-registered-client-id'}`,
  );
  console.log(
    `  Client Secret: ${process.env.OAUTH_CLIENT_SECRET ? '***' : '(not set)'}`,
  );
  console.log(`  Auth Server: ${authServerUrl}`);
  console.log(`  MCP Server: ${mcpServerUrl}`);
  console.log(`  Audience: api.atlassian.com\n`);

  // Run auth against the authorization server
  await authorizeWithPkceOnce(authProvider, authServerUrl, () =>
    waitForAuthorizationCode(Number(8090)),
  );

  // Connect to the actual MCP server
  const mcpClient = await experimental_createMCPClient({
    transport: { type: 'sse', url: mcpServerUrl, authProvider },
  });
  const tools = await mcpClient.tools();

  console.log(`Retrieved ${Object.keys(tools).length} protected tools`);
  console.log(`Available tools: ${Object.keys(tools).join(', ')}`);

  const { text: answer } = await generateText({
    model: openai('gpt-4o-mini'),
    tools,
    stopWhen: stepCountIs(10),
    onStepFinish: async ({ toolResults }) => {
      if (toolResults.length > 0) {
        console.log('Tool execution results:');
        toolResults.forEach(result => {
          console.log(
            `  - ${result.toolName}:`,
            JSON.stringify(result, null, 2),
          );
        });
      }
    },
    system: 'You are a helpful assistant with access to protected tools.',
    prompt:
      'List the tools available for me to call. Arrange them in alphabetical order.',
  });

  await mcpClient.close();

  console.log(`FINAL ANSWER: ${answer}`);
}

main().catch(console.error);



// https://www.notion.so/install-integration?response_type=code&client_id=1f8d872b-594c-80a4-b2f4-00370af2b13f&redirect_uri=https%3A%2F%2Fmcp.notion.com%2Fcallback&state=eyJyZXNwb25zZVR5cGUiOiJjb2RlIiwiY2xpZW50SWQiOiJvR1Fla1kxeXAyc0pCb0RXNTBxS0dDNEpsMjJDb3JXMSIsInJlZGlyZWN0VXJpIjoiaHR0cDovL2xvY2FsaG9zdDo4MDkwL2NhbGxiYWNrIiwic2NvcGUiOlsicmVhZDptZSIsInJlYWQ6YWNjb3VudCJdLCJzdGF0ZSI6IiIsImNvZGVDaGFsbGVuZ2UiOiJIX29kV3RJVGNWSzJtQTdIeVB1am5CVVN6eGx4a1haREl1LWhRbkVrU3Z3IiwiY29kZUNoYWxsZW5nZU1ldGhvZCI6IlMyNTYiLCJtY3Bfc3RhdGVfa2V5IjoibWNwX2I3MGRhYzQ4ZWYyMjQ2MGVhNDUwMmUzNmE1NzQ1MDlkIiwibWNwX3N0YXRlX3ZhbCI6IjJiYjYxNWVkLWQ1MmItNDhhZC1iNTc3LTVhMDE3NzcwN2M0ZiIsIm1jcF90aW1lIjoxNzYzMDcyODc4MzI4fQ%3D%3D&owner=user