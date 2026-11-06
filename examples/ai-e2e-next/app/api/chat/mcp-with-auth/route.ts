import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';
import { createMCPClient, auth } from '@ai-sdk/mcp';
import { isLocalDevelopmentRequest } from '../../code-execution-files/is-local-development-request';
import {
  createOAuthSession,
  getOAuthSession,
  sessionCookieName,
  sessionMaxAge,
} from './oauth-session';

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

function response(message: string, status: number) {
  return new Response(message, { status, headers: responseHeaders });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const isCallback = url.searchParams.size > 0;
  // OAuth redirects are cross-site navigations. Keep the loopback/host/proxy
  // checks, then require the initiating browser's cookie AND one-time state.
  const headers = new Headers(req.headers);
  if (isCallback) headers.delete('sec-fetch-site');
  if (!isLocalDevelopmentRequest(new Request(req.url, { headers }))) {
    return response('MCP OAuth is only available in local development.', 403);
  }

  const session = getOAuthSession(req);
  if (!isCallback) {
    if (session) return response('Session ready.', 200);
    const id = createOAuthSession(req);
    if (!id) return response('Too many sessions. Try again later.', 429);
    return new Response('Session ready.', {
      headers: {
        ...responseHeaders,
        'Set-Cookie': `${sessionCookieName}=${id}; HttpOnly; SameSite=Lax; Path=/api/chat/mcp-with-auth; Max-Age=${sessionMaxAge}${url.protocol === 'https:' ? '; Secure' : ''}`,
      },
    });
  }

  if (!session) return response('Session required.', 401);
  if (session.busy)
    return response('Authorization is already in progress.', 409);
  const provider = session.provider;
  const state = url.searchParams.get('state');
  if (
    url.searchParams.get('callback') !== '1' ||
    !state ||
    state !== provider.storedState() ||
    !provider.pendingAuthorization ||
    provider.pendingAuthorization.expiresAt <= Date.now()
  ) {
    return response('Invalid or expired authorization callback.', 400);
  }

  // Consume the pending callback before awaiting the token exchange. Retain
  // state/PKCE until auth() has independently verified them.
  session.busy = true;
  provider.pendingAuthorization = undefined;
  try {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) {
      return response(
        'Authorization was not completed. Retry your message.',
        400,
      );
    }
    const result = await auth(provider, {
      serverUrl: provider.serverUrl,
      authorizationCode: code,
      callbackState: state,
      callbackIssuer: url.searchParams.get('iss') ?? undefined,
    });
    if (result !== 'AUTHORIZED') return response('Authorization failed.', 400);
    return response(
      'Connected. Close this tab and retry your message in the chat.',
      200,
    );
  } catch {
    return response('Authorization failed. Retry your message.', 400);
  } finally {
    provider.clearAuthorization();
    session.busy = false;
  }
}

export async function POST(req: Request) {
  if (!isLocalDevelopmentRequest(req)) {
    return response('MCP OAuth is only available in local development.', 403);
  }
  const session = getOAuthSession(req);
  if (!session) return response('Session required.', 401);
  if (session.busy) return response('A request is already in progress.', 409);
  session.busy = true;

  try {
    const { messages } = await req.json();
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        const provider = session.provider;
        try {
          if (
            !provider.pendingAuthorization ||
            provider.pendingAuthorization.expiresAt <= Date.now()
          ) {
            provider.clearAuthorization();
            const result = await auth(provider, {
              serverUrl: provider.serverUrl,
            });
            if (result !== 'AUTHORIZED' && !provider.pendingAuthorization) {
              throw new Error('Authorization required');
            }
          }
          if (provider.pendingAuthorization) {
            writer.write({
              type: 'data-oauth',
              data: { url: provider.pendingAuthorization.url },
              transient: true,
            });
            return;
          }
          if (!provider.tokens()) throw new Error('Authorization required');

          const mcpClient = await createMCPClient({
            transport: {
              type: 'http',
              url: provider.serverUrl.toString(),
              authProvider: provider,
            },
          });
          try {
            const tools = await mcpClient.tools();
            const result = streamText({
              model: openai('gpt-6-luna'),
              tools,
              stopWhen: isStepCount(10),
              instructions:
                'You are a helpful assistant with access to protected tools.',
              messages: await convertToModelMessages(messages),
              abortSignal: req.signal,
            });
            writer.merge(
              toUIMessageStream({
                stream: result.stream,
                originalMessages: messages,
              }),
            );
            await result.consumeStream();
          } finally {
            await mcpClient.close();
          }
        } finally {
          session.busy = false;
        }
      },
    });
    return createUIMessageStreamResponse({ stream, headers: responseHeaders });
  } catch (error) {
    session.busy = false;
    console.error('MCP with auth error:', error);
    return response('Unexpected error.', 500);
  }
}
