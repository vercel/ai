import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpritesSandbox } from './sprites-sandbox';

type Call = { method: string; url: string; body?: string };
let calls: Call[] = [];

/** Sprite JSON returned by GET/POST for a given name. */
function spriteBody(
  name: string,
  auth: 'public' | 'sprite' = 'sprite',
): string {
  return JSON.stringify({
    id: `sprite-${name}`,
    name,
    status: 'warm',
    url: `https://${name}-x.sprites.app`,
    url_settings: { auth },
  });
}

interface FetchScenario {
  /** Status to return for POST /v1/sprites (default 201 create). */
  createStatus?: number;
  /** auth reported by created/fetched sprite (default 'sprite'). */
  auth?: 'public' | 'sprite';
}

function installFetch(scenario: FetchScenario = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ method, url, body });
    const u = new URL(url);
    const auth = scenario.auth ?? 'sprite';

    // POST /v1/sprites  (create)
    if (method === 'POST' && u.pathname === '/v1/sprites') {
      const parsed = JSON.parse(body ?? '{}') as { name: string };
      const status = scenario.createStatus ?? 201;
      if (status >= 400) {
        return new Response('{"error":"already exists"}', { status });
      }
      return new Response(spriteBody(parsed.name, auth), { status });
    }
    // GET /v1/sprites/{name}
    const getMatch = u.pathname.match(/^\/v1\/sprites\/([^/]+)$/);
    if (getMatch && method === 'GET') {
      return new Response(spriteBody(decodeURIComponent(getMatch[1]), auth), {
        status: 200,
      });
    }
    // PUT /v1/sprites/{name}  (url auth)
    if (getMatch && method === 'PUT') {
      return new Response('', { status: 200 });
    }
    // DELETE /v1/sprites/{name}
    if (getMatch && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    // POST /v1/sprites/{name}/policy/network
    if (method === 'POST' && u.pathname.endsWith('/policy/network')) {
      return new Response(null, { status: 204 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  calls = [];
  delete process.env.SPRITES_API_KEY;
  delete process.env.SPRITES_TOKEN;
  delete process.env.SPRITES_API_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createSpritesSandbox', () => {
  it('throws when no API key is provided', () => {
    expect(() => createSpritesSandbox({})).toThrow(/API key is required/);
  });

  it('reads the API key from SPRITES_API_KEY', () => {
    process.env.SPRITES_API_KEY = 'env-key';
    const provider = createSpritesSandbox({});
    expect(provider.providerId).toBe('sprites-sandbox');
    expect(provider.specificationVersion).toBe('harness-sandbox-v1');
  });
});

describe('create-new createSession', () => {
  it('creates a deterministically-named sprite from sessionId and forces url auth public', async () => {
    installFetch({ auth: 'sprite' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'Run #7!' });

    expect(session.id).toBe('ai-sdk-harness-session-run-7');
    expect(session.defaultWorkingDirectory).toBe('/home/sprite');
    expect([...session.ports]).toEqual([8080]);

    const create = calls.find(
      c => c.method === 'POST' && c.url.endsWith('/v1/sprites'),
    );
    expect(JSON.parse(create?.body ?? '{}').name).toBe(
      'ai-sdk-harness-session-run-7',
    );
    // url auth was sprite -> provider PUTs public
    const put = calls.find(c => c.method === 'PUT');
    expect(put?.body).toContain('"auth":"public"');
  });

  it('does not change url auth when the sprite is already public', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    await provider.createSession({ sessionId: 's1' });
    expect(calls.some(c => c.method === 'PUT')).toBe(false);
  });

  it('runs onFirstCreate only on a fresh create', async () => {
    installFetch();
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const onFirstCreate = vi.fn(async () => {});
    await provider.createSession({ sessionId: 's1', onFirstCreate });
    expect(onFirstCreate).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing sprite (409) and skips onFirstCreate', async () => {
    installFetch({ createStatus: 409 });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const onFirstCreate = vi.fn(async () => {});
    const session = await provider.createSession({
      sessionId: 's1',
      onFirstCreate,
    });
    expect(session.id).toBe('ai-sdk-harness-session-s1');
    expect(onFirstCreate).not.toHaveBeenCalled();
    // fell back to GET
    expect(calls.some(c => c.method === 'GET')).toBe(true);
  });

  it('destroy() deletes the provider-owned sprite', async () => {
    installFetch();
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 's1' });
    await session.stop();
    await session.destroy?.();
    expect(calls.some(c => c.method === 'DELETE')).toBe(true);
  });
});

describe('getPortUrl', () => {
  it('maps the proxied port 8080 to the public URL with the requested scheme', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'p' });

    expect(await session.getPortUrl({ port: 8080 })).toBe(
      'https://ai-sdk-harness-session-p-x.sprites.app/',
    );
    expect(await session.getPortUrl({ port: 8080, protocol: 'ws' })).toBe(
      'wss://ai-sdk-harness-session-p-x.sprites.app/',
    );
  });

  it('throws for any non-proxied port', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'p' });
    await expect(session.getPortUrl({ port: 3000 })).rejects.toThrow(/8080/);
  });
});

describe('setNetworkPolicy', () => {
  it('maps deny-all, custom domain allow-list, and allow-all', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'n' });

    await session.setNetworkPolicy?.({ mode: 'deny-all' });
    await session.setNetworkPolicy?.({
      mode: 'custom',
      allowedHosts: ['github.com', '*.npmjs.org'],
    });
    await session.setNetworkPolicy?.({ mode: 'allow-all' });

    const policyCalls = calls.filter(c => c.url.endsWith('/policy/network'));
    expect(JSON.parse(policyCalls[0].body ?? '{}')).toEqual({
      rules: [{ action: 'deny', domain: '*' }],
    });
    expect(JSON.parse(policyCalls[1].body ?? '{}')).toEqual({
      rules: [
        { action: 'allow', domain: 'github.com' },
        { action: 'allow', domain: '*.npmjs.org' },
        { action: 'deny', domain: '*' },
      ],
    });
    expect(JSON.parse(policyCalls[2].body ?? '{}')).toEqual({ rules: [] });
  });

  it('rejects CIDR-based custom policies as unsupported', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'n' });
    await expect(
      session.setNetworkPolicy?.({
        mode: 'custom',
        allowedCIDRs: ['10.0.0.0/8'],
      }),
    ).rejects.toThrow(/domain-based/);
  });
});

describe('wrap-existing sprite', () => {
  it('wraps by name and does not delete on destroy', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
    });
    const session = await provider.createSession();
    expect(session.id).toBe('my-existing');
    await session.destroy?.();
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
  });
});

describe('resumeSession', () => {
  it('reattaches to the sprite derived from sessionId', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    expect(provider.resumeSession).toBeDefined();
    const session = await provider.resumeSession?.({ sessionId: 's1' });
    expect(session?.id).toBe('ai-sdk-harness-session-s1');
    expect(
      calls.some(
        c => c.method === 'GET' && c.url.endsWith('ai-sdk-harness-session-s1'),
      ),
    ).toBe(true);
  });
});
