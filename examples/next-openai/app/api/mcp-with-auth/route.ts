import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';
import {
  experimental_createMCPClient as createMCPClient,
  auth,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthTokens,
} from '@ai-sdk/mcp';
import { randomUUID } from 'node:crypto';
import { createAuthorizationCallback } from './oauth-callback';

// This local development example authorizes each request independently.
// Persisting credentials across requests requires authenticated application sessions.
class InMemoryOAuthClientProvider {
  private credentials: {
    tokens?: OAuthTokens;
    codeVerifier?: string;
    clientInformation?: OAuthClientInformation;
  } = {};
  pendingAuthorizationUrl: string | undefined;

  constructor(
    private readonly _redirectUrl: string,
    private authorizationState: string,
  ) {}

  async state(): Promise<string> {
    return this.authorizationState;
  }

  async saveState(state: string): Promise<void> {
    this.authorizationState = state;
  }

  async storedState(): Promise<string> {
    return this.authorizationState;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this.credentials.tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.credentials.tokens = tokens;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.pendingAuthorizationUrl = authorizationUrl.toString();
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    this.credentials.codeVerifier = codeVerifier;
  }

  async codeVerifier(): Promise<string> {
    const verifier = this.credentials.codeVerifier;
    if (!verifier) throw new Error('No code verifier saved');
    return verifier;
  }

  get redirectUrl(): string | URL {
    return this._redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'AI SDK MCP OAuth Example (Next.js)',
      redirect_uris: [String(this._redirectUrl)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post',
    } as any;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return this.credentials.clientInformation;
  }

  // This example only obtains client information through dynamic registration.
  async isClientInformationDynamicallyRegistered(): Promise<boolean> {
    return this.credentials.clientInformation !== undefined;
  }
  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    this.credentials.clientInformation = info;
  }

  addClientAuthentication = async (
    headers: Headers,
    params: URLSearchParams,
    _url: string | URL,
  ): Promise<void> => {
    const info = this.credentials.clientInformation;
    if (!info) {
      return;
    }

    const method = (info as any).token_endpoint_auth_method as
      | 'client_secret_post'
      | 'client_secret_basic'
      | 'none'
      | undefined;

    const hasSecret = Boolean((info as any).client_secret);
    const clientId = info.client_id;
    const clientSecret = (info as any).client_secret as string | undefined;

    const chosen = method ?? (hasSecret ? 'client_secret_post' : 'none');

    if (chosen === 'client_secret_basic') {
      if (!clientSecret) {
        params.set('client_id', clientId);
        return;
      }
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );
      headers.set('Authorization', `Basic ${credentials}`);
      return;
    }

    if (chosen === 'client_secret_post') {
      params.set('client_id', clientId);
      if (clientSecret) params.set('client_secret', clientSecret);
      return;
    }

    params.set('client_id', clientId);
  };

  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier') {
    const state = this.credentials;
    if (scope === 'all' || scope === 'tokens') state.tokens = undefined;
    if (scope === 'all' || scope === 'client')
      state.clientInformation = undefined;
    if (scope === 'all' || scope === 'verifier') state.codeVerifier = undefined;
  }
}

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  if (
    process.env.NODE_ENV === 'production' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname) ||
    req.headers.get('origin') !== requestUrl.origin
  ) {
    return Response.json(
      {
        error:
          'This OAuth example is available only from the local development app.',
      },
      { status: 403 },
    );
  }
  const body = await req.json();
  const messages = body.messages;
  const serverUrl: string = 'https://mcp.vercel.com/';

  try {
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const state = randomUUID();
        const callback = await createAuthorizationCallback(state, req.signal);
        const authProvider = new InMemoryOAuthClientProvider(
          callback.redirectUrl,
          state,
        );

        try {
          // Attempt auth; if redirect is needed, instruct client to open URL, then wait and complete.
          const result = await auth(authProvider, {
            serverUrl: new URL(serverUrl),
          });

          if (result !== 'AUTHORIZED') {
            const url = authProvider.pendingAuthorizationUrl;
            if (url) {
              writer.write({
                type: 'data-oauth',
                data: { url },
                transient: true,
              });
            }

            const {
              code: authorizationCode,
              state: callbackState,
              issuer: callbackIssuer,
            } = await callback.authorizationCode;
            await auth(authProvider, {
              serverUrl: new URL(serverUrl),
              authorizationCode,
              callbackState,
              callbackIssuer,
            });
          }

          const mcpClient = await createMCPClient({
            transport: { type: 'http', url: serverUrl, authProvider },
          });

          try {
            const tools = await mcpClient.tools();

            const result = streamText({
              model: openai('gpt-4o-mini'),
              abortSignal: req.signal,
              tools,
              stopWhen: stepCountIs(10),
              system:
                'You are a helpful assistant with access to protected tools.',
              messages: convertToModelMessages(messages),
            });

            writer.merge(
              result.toUIMessageStream({ originalMessages: messages }),
            );
            await result.consumeStream();
          } finally {
            await mcpClient.close();
          }
        } finally {
          callback.close();
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('MCP with auth error:', error);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
