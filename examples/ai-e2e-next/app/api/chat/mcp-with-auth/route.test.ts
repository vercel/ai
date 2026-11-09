import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, type OAuthClientProvider } from '@ai-sdk/mcp';
import { GET, POST } from './route';
import { getOAuthSession } from './oauth-session';

vi.mock('@ai-sdk/mcp', () => ({
  auth: vi.fn(),
  createMCPClient: vi.fn(),
}));

const routeUrl = 'http://localhost:3000/api/chat/mcp-with-auth';

function request(cookie = '', method = 'GET', url = routeUrl) {
  return new Request(url, {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      cookie,
    },
    ...(method === 'POST' ? { body: JSON.stringify({ messages: [] }) } : {}),
  });
}

async function browser() {
  const response = await GET(request());
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const session = getOAuthSession(request(cookie))!;
  return { cookie, session };
}

async function consent(provider: OAuthClientProvider) {
  const state = await provider.state!();
  await provider.saveState!(state);
  await provider.saveCodeVerifier('test-verifier');
  const url = new URL('https://authorization.example/authorize');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', String(provider.redirectUrl));
  await provider.redirectToAuthorization(url);
  return 'REDIRECT' as const;
}

async function send(cookie: string) {
  const response = await POST(request(cookie, 'POST'));
  return { response, body: await response.text() };
}

function callback(state: string) {
  const url = new URL(routeUrl);
  url.searchParams.set('callback', '1');
  url.searchParams.set('state', state);
  url.searchParams.set('code', 'test-code');
  return url.toString();
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VERCEL', undefined);
  vi.mocked(auth).mockReset();
  vi.mocked(auth).mockImplementation(consent);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('MCP OAuth callback lifecycle', () => {
  it('rejects anonymous chat requests before starting authorization', async () => {
    const { response } = await send('');
    expect(response.status).toBe(401);
    expect(auth).not.toHaveBeenCalled();
  });

  it('returns independent consent URLs for concurrent browser sessions', async () => {
    const first = await browser();
    const second = await browser();
    const results = await Promise.all([
      send(first.cookie),
      send(second.cookie),
    ]);

    for (const result of results) {
      expect(result.response.status).toBe(200);
      expect(result.body).toContain('data-oauth');
    }
    for (const { session } of [first, second]) {
      const url = new URL(session.provider.pendingAuthorization!.url);
      expect(url.searchParams.get('redirect_uri')).toBe(
        `${routeUrl}?callback=1`,
      );
      expect(session.busy).toBe(false);
    }
    expect(first.session.provider.storedState()).not.toBe(
      second.session.provider.storedState(),
    );
    expect(auth).toHaveBeenCalledTimes(2);
  });

  it('rejects overlapping requests in one session while another session proceeds', async () => {
    const first = await browser();
    const second = await browser();
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.mocked(auth).mockImplementationOnce(async provider => {
      await pending;
      return consent(provider);
    });

    const response = await POST(request(first.cookie, 'POST'));
    try {
      expect((await send(first.cookie)).response.status).toBe(409);
      expect((await send(second.cookie)).body).toContain('data-oauth');
      expect(auth).toHaveBeenCalledTimes(2);
    } finally {
      release();
      await response.text();
    }
    expect(first.session.busy).toBe(false);
  });

  it('reuses pending consent without holding a chat request open', async () => {
    const { cookie, session } = await browser();
    const first = await send(cookie);
    const pending = session.provider.pendingAuthorization;
    const second = await send(cookie);

    expect(first.body).toContain('data-oauth');
    expect(second.body).toContain('data-oauth');
    expect(session.provider.pendingAuthorization).toBe(pending);
    expect(auth).toHaveBeenCalledOnce();
    expect(session.busy).toBe(false);
  });

  it('rejects expired callbacks and starts fresh authorization after five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { cookie, session } = await browser();
    await send(cookie);
    const oldState = session.provider.storedState()!;
    vi.setSystemTime(Date.now() + 5 * 60 * 1000);

    const response = await GET(request(cookie, 'GET', callback(oldState)));
    expect(response.status).toBe(400);
    expect(auth).toHaveBeenCalledOnce();
    expect((await send(cookie)).body).toContain('data-oauth');
    expect(auth).toHaveBeenCalledTimes(2);
    expect(session.provider.storedState()).not.toBe(oldState);
    expect(session.busy).toBe(false);
  });

  it('requires the initiating browser session and matching callback state', async () => {
    const first = await browser();
    const second = await browser();
    await send(first.cookie);
    const url = callback(first.session.provider.storedState()!);

    expect((await GET(request('', 'GET', url))).status).toBe(401);
    expect((await GET(request(second.cookie, 'GET', url))).status).toBe(400);
    expect(
      (await GET(request(first.cookie, 'GET', callback('wrong-state')))).status,
    ).toBe(400);
    expect(first.session.provider.pendingAuthorization).toBeDefined();
    expect(auth).toHaveBeenCalledOnce();
  });

  it('consumes a successful callback once and clears state and PKCE', async () => {
    const { cookie, session } = await browser();
    await send(cookie);
    const state = session.provider.storedState()!;
    const url = new URL(callback(state));
    url.searchParams.set('iss', 'https://authorization.example');
    vi.mocked(auth).mockResolvedValueOnce('AUTHORIZED');

    expect((await GET(request(cookie, 'GET', url.toString()))).status).toBe(
      200,
    );
    expect(auth).toHaveBeenLastCalledWith(session.provider, {
      serverUrl: session.provider.serverUrl,
      authorizationCode: 'test-code',
      callbackState: state,
      callbackIssuer: 'https://authorization.example',
    });
    expect(session.provider.pendingAuthorization).toBeUndefined();
    expect(session.provider.storedState()).toBeUndefined();
    expect(() => session.provider.codeVerifier()).toThrow('No code verifier');
    expect(session.busy).toBe(false);
    expect((await GET(request(cookie, 'GET', url.toString()))).status).toBe(
      400,
    );
    expect(auth).toHaveBeenCalledTimes(2);
  });

  it('cleans up denied authorization and allows a retry', async () => {
    const { cookie, session } = await browser();
    await send(cookie);
    const url = new URL(callback(session.provider.storedState()!));
    url.searchParams.set('error', 'access_denied');

    expect((await GET(request(cookie, 'GET', url.toString()))).status).toBe(
      400,
    );
    expect(session.provider.pendingAuthorization).toBeUndefined();
    expect(session.provider.storedState()).toBeUndefined();
    expect(session.busy).toBe(false);
    expect((await send(cookie)).body).toContain('data-oauth');
    expect(auth).toHaveBeenCalledTimes(2);
  });
});
