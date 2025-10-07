import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient, generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import type { OAuthClientProvider } from '../../../../packages/ai/src/tool/mcp/oauth.js';
import {
  auth,
  UnauthorizedError,
} from '../../../../packages/ai/src/tool/mcp/oauth.js';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '../../../../packages/ai/src/tool/mcp/oauth-types.js';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';

class InMemoryOAuthClientProvider implements OAuthClientProvider {
  private _tokens?: OAuthTokens;
  private _codeVerifier?: string;
  private _clientInformation?: OAuthClientInformation;
  private _redirectUrl: string | URL =
    `http://localhost:${process.env.MCP_CALLBACK_PORT ?? 8090}/callback`;

  async tokens(): Promise<OAuthTokens | undefined> {
    return this._tokens;
  }
  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this._tokens = tokens;
  }
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const cmd =
      process.platform === 'win32'
        ? `start ${authorizationUrl.toString()}`
        : process.platform === 'darwin'
          ? `open "${authorizationUrl.toString()}"`
          : `xdg-open "${authorizationUrl.toString()}"`;
    exec(cmd, error => {
      if (error) {
        console.error(
          'Open this URL to continue:',
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
      client_name: 'AI SDK MCP OAuth Example',
      redirect_uris: [String(this._redirectUrl)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    };
  }
  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this._clientInformation;
  }
  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    this._clientInformation = info;
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
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>',
        );
        setTimeout(() => server.close(), 100);
        resolve(code);
      } else {
        res
          .writeHead(400)
          .end(`Authorization failed: ${err ?? 'missing code'}`);
        setTimeout(() => server.close(), 100);
        reject(new Error(`Authorization failed: ${err ?? 'missing code'}`));
      }
    });
    server.listen(port, () => {
      console.log(`OAuth callback: http://localhost:${port}/callback`);
    });
  });
}

async function main() {
  const authProvider = new InMemoryOAuthClientProvider();

  console.log('Creating MCP client with OAuth...');

  try {
    const serverUrl =
      process.env.MCP_SERVER_URL || 'https://mcp.notion.com/sse';
    const callbackPromise = waitForAuthorizationCode(
      Number(process.env.MCP_CALLBACK_PORT ?? 8090),
    );

    const connect = async () =>
      experimental_createMCPClient({
        transport: { type: 'sse', url: serverUrl, authProvider },
        onUncaughtError: error =>
          console.error('MCP Client uncaught error:', error),
      });

    let mcpClient;
    try {
      mcpClient = await connect();
    } catch (error) {
      const unauthorized =
        error instanceof UnauthorizedError ||
        (error &&
          typeof error === 'object' &&
          (error as any).name === 'UnauthorizedError');
      if (unauthorized) {
        console.log('🔐 Authorization required. Waiting for OAuth callback...');

        const authorizationCode = await callbackPromise;

        console.log('↪ Exchanging authorization code for tokens...');
        await auth(authProvider, {
          serverUrl: new URL(serverUrl),
          authorizationCode,
        });

        console.log('↪ Retrying connection with authorized tokens...');
        mcpClient = await connect();
      } else {
        throw error;
      }
    }

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
      prompt: 'List the user resources.',
    });

    await mcpClient.close();

    console.log('\n=== Final Answer ===');
    console.log(answer);
    console.log('\n✓ MCP client closed');
  } catch (error) {
    console.error('\nError during MCP client execution:');
    console.error(error);
    throw error;
  }
}

// Handle OAuth callback in a real application
// For this demo, the server auto-approves and the provider handles it internally
main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
