import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import type {
  OAuthClientProvider,
  AuthResult,
} from '../../../../packages/ai/src/tool/mcp/oauth.js';

// Simple OAuth provider that pre-configures a token for demo purposes
class DemoOAuthProvider implements OAuthClientProvider {
  private accessToken: string | null = null;

  async tokens(): Promise<{ access_token: string } | null> {
    return this.accessToken ? { access_token: this.accessToken } : null;
  }

  async authorize(options: {
    serverUrl: URL;
    resourceMetadataUrl?: URL;
  }): Promise<AuthResult> {
    console.log('  → Authorizing with server:', options.serverUrl.toString());
    if (options.resourceMetadataUrl) {
      console.log(
        '  → Resource metadata URL:',
        options.resourceMetadataUrl.toString(),
      );
    }

    // In a real implementation, this would:
    // 1. Discover OAuth endpoints via metadata
    // 2. Register as a client (if needed)
    // 3. Get authorization code
    // 4. Exchange code for token

    // For this demo, we use a pre-configured token that the server accepts
    this.accessToken = 'demo-access-token-123';
    console.log('  → Token acquired:', this.accessToken);
    console.log('  → Authorization complete, transport will retry with token');

    return 'AUTHORIZED';
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
