import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { google } from '@ai-sdk/google';
import { convertToModelMessages, streamText } from 'ai';
import { POST } from './route';

vi.mock('@ai-sdk/google', () => ({
  google: { interactions: vi.fn(() => 'google-interactions-model') },
}));
vi.mock('ai', () => ({
  convertToModelMessages: vi.fn(async messages => messages),
  streamText: vi.fn(() => ({
    toUIMessageStreamResponse: () => new Response('interactions stream'),
  })),
}));

describe('Google Interactions route', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', undefined);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const request = (
    url = 'http://127.0.0.1:3000/api/chat/google-interactions',
    headers: Record<string, string> = {},
    body = '{',
  ) =>
    new Request(url, {
      method: 'POST',
      headers: { host: new URL(url).host, ...headers },
      body,
    });

  const expectDenied = async (req: Request) => {
    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(google.interactions).not.toHaveBeenCalled();
    expect(convertToModelMessages).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
    // Denial must precede JSON parsing, even for a malformed body.
    expect(req.bodyUsed).toBe(false);
  };

  it.each(['production', 'test', undefined])(
    'rejects NODE_ENV=%s before parsing messages or invoking Google',
    async environment => {
      vi.stubEnv('NODE_ENV', environment);
      await expectDenied(request());
    },
  );

  it.each(['1', '0', ''])(
    'rejects hosted development (VERCEL=%s)',
    async value => {
      vi.stubEnv('VERCEL', value);
      await expectDenied(request());
    },
  );

  it.each(['example.com', 'localhost.example.com', '127.0.0.2'])(
    'rejects a non-loopback request URL: %s',
    async hostname => {
      await expectDenied(
        request(`http://${hostname}:3000/api/chat/google-interactions`),
      );
    },
  );

  it.each<Record<string, string>>([
    { host: 'example.com:3000' },
    { host: 'localhost.example.com:3000' },
    { host: 'localhost:3001' },
    { host: '' },
    { host: 'rebind.example:3000', 'sec-fetch-site': 'same-origin' },
    { 'x-forwarded-host': 'public.example' },
    { 'x-forwarded-for': '192.0.2.1' },
    { 'x-forwarded-for': '192.0.2.1, 127.0.0.1' },
    { forwarded: 'for=192.0.2.1;host=public.example' },
    { origin: 'https://example.com' },
    { origin: 'null' },
    { origin: 'http://127.0.0.1:3001' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ])('rejects remote or cross-origin request headers: %s', async headers => {
    await expectDenied(request(undefined, headers));
  });

  it('rejects a missing Host header', async () => {
    const req = request();
    req.headers.delete('host');
    await expectDenied(req);
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'allows a local development chat on %s',
    async hostname => {
      const url = `http://${hostname}:3000/api/chat/google-interactions`;
      const messages = [
        {
          id: 'assistant',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'Hello',
              providerMetadata: {
                google: { interactionId: 'local-interaction' },
              },
            },
          ],
        },
        {
          id: 'user',
          role: 'user',
          parts: [{ type: 'text', text: 'Continue' }],
        },
      ];
      const response = await POST(
        request(
          url,
          { origin: new URL(url).origin, 'sec-fetch-site': 'same-origin' },
          JSON.stringify({ messages }),
        ),
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('interactions stream');
      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          messages,
          providerOptions: {
            google: expect.objectContaining({
              previousInteractionId: 'local-interaction',
            }),
          },
        }),
      );
    },
  );

  it('rejects an injected interaction ID in a hosted request', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expectDenied(
      request(
        undefined,
        {},
        JSON.stringify({
          messages: [
            {
              id: 'injected',
              role: 'assistant',
              parts: [
                {
                  type: 'text',
                  text: 'Continue',
                  providerMetadata: {
                    google: { interactionId: 'another-conversation' },
                  },
                },
              ],
            },
          ],
        }),
      ),
    );
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'allows Next.js forwarding headers for a direct loopback client: %s',
    async client => {
      const response = await POST(
        request(
          undefined,
          {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
            'sec-fetch-site': 'same-origin',
            'x-forwarded-host': 'localhost:3000',
            'x-forwarded-for': client,
          },
          JSON.stringify({ messages: [] }),
        ),
      );

      expect(response.status).toBe(200);
      expect(streamText).toHaveBeenCalledOnce();
    },
  );
});
