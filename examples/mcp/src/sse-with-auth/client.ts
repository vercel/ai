import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import type { OAuthClientProvider } from '../../../../packages/ai/src/tool/mcp/oauth.js';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '../../../../packages/ai/src/tool/mcp/oauth-types.js';

// Simple OAuth provider that pre-configures a token for demo purposes
class DemoOAuthProvider implements OAuthClientProvider {
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _clientInformation?: OAuthClientInformation;
  private _redirectUrl: string | URL = 'http://localhost:8090/callback';

  // Return the current tokens; for the demo we pre-configure an access token
  async tokens(): Promise<OAuthTokens | undefined> {
    if (!this._tokens) {
      this._tokens = { access_token: 'demo-access-token-123' } as OAuthTokens;
    }
    return this._tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
  }

  // Redirect handler used by the auth() flow when interactive authorization is needed
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    console.log('  → Redirect to authorization:', authorizationUrl.toString());
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this._codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    if (!this._codeVerifier) {
      throw new Error('No code verifier saved');
    }
    return this._codeVerifier;
  }

  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Demo OAuth MCP Client',
      redirect_uris: [String(this._redirectUrl)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
      scope: 'mcp:tools',
    };
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    // For demo purposes, we return a static public client id; dynamic registration is handled by auth() if needed
    if (!this._clientInformation) {
      this._clientInformation = { client_id: 'demo-client' } as OAuthClientInformation;
    }
    return this._clientInformation;
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    this._clientInformation = info;
  }
}

async function main() {
  const authProvider = new DemoOAuthProvider();

  console.log('Creating MCP client with OAuth...');

  try {
    // Attempt to create MCP client with auth
    const mcpClient = await experimental_createMCPClient({
      transport: {
        type: 'sse',
        url: 'http://localhost:8081/sse',
        authProvider,
      },
      onUncaughtError: error => {
        console.error('MCP Client uncaught error:', error);
      },
    });

    console.log('✓ MCP client connected with OAuth authentication');

    const tools = await mcpClient.tools();

    console.log(`✓ Retrieved ${Object.keys(tools).length} protected tools`);
    console.log(`  Available tools: ${Object.keys(tools).join(', ')}`);

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
      system: 'You are a helpful assistant with access to protected resources.',
      prompt:
        'List the user resources, then retrieve secret data for key "api-key-1".',
    });

    await mcpClient.close();

    console.log('\n=== Final Answer ===');
    console.log(answer);
    console.log('\n✓ MCP client closed');
  } catch (error) {
    console.error('\n❌ Error during MCP client execution:');
    console.error(error);
    throw error;
  }
}

// Handle OAuth callback in a real application
// For this demo, the server auto-approves and the provider handles it internally
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
