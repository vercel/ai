import {
  HarnessCapabilityUnsupportedError,
  HarnessSandboxAuthenticationError,
} from '@ai-sdk/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSpritesNetworkSandboxSession,
  createSpritesSandbox,
  resumeSpritesNetworkSandboxSession,
} from './sprites-sandbox';

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
  /** Whether a bootstrap marker file already exists (fs/read → 200 vs 404). */
  markerExists?: boolean;
  /** Whether GET /v1/sprites/{name} finds the sprite (default true). */
  spriteExists?: boolean;
  /** Error status to return for GET /v1/sprites/{name}. */
  lookupStatus?: number;
  /** Error status to return for PUT /v1/sprites/{name} (url auth). */
  urlAuthStatus?: number;
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
      if (scenario.lookupStatus != null) {
        return new Response('{"error":"rejected"}', {
          status: scenario.lookupStatus,
        });
      }
      if (scenario.spriteExists === false) {
        return new Response('{"error":"not found"}', { status: 404 });
      }
      return new Response(spriteBody(decodeURIComponent(getMatch[1]), auth), {
        status: 200,
      });
    }
    // PUT /v1/sprites/{name}  (url auth)
    if (getMatch && method === 'PUT') {
      if (scenario.urlAuthStatus != null) {
        return new Response('{"error":"rejected"}', {
          status: scenario.urlAuthStatus,
        });
      }
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
    // GET /v1/sprites/{name}/fs/read  (bootstrap marker probe)
    if (method === 'GET' && u.pathname.endsWith('/fs/read')) {
      return scenario.markerExists
        ? new Response('done', { status: 200 })
        : new Response('{"error":"no such file"}', { status: 404 });
    }
    // PUT /v1/sprites/{name}/fs/write  (marker write)
    if (method === 'PUT' && u.pathname.endsWith('/fs/write')) {
      return new Response('', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Argument vectors of the processes started over the fake exec WebSocket. */
let execCommands: string[][] = [];
/** Directory the fake Sprite reports for `pwd`. */
let execWorkingDirectory = '/home/sprite';
/** Processes whose command line matches fail with exit code 1. */
let execFailingCommand: RegExp | undefined;

/**
 * Fake exec WebSocket: answers `pwd` with {@link execWorkingDirectory} and
 * exits every process with code 0, unless {@link execFailingCommand} matches.
 */
class FakeExecWebSocket {
  binaryType = 'blob';
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: { message?: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    const argv = new URL(url).searchParams.getAll('cmd');
    execCommands.push(argv);
    // Defer so the client can assign handlers first.
    setTimeout(() => {
      this.onopen?.({});
      if (argv[0] === 'pwd') {
        const output = new TextEncoder().encode(`${execWorkingDirectory}\n`);
        this.onmessage?.({ data: new Uint8Array([0x01, ...output]).buffer });
      }
      const failed = execFailingCommand?.test(argv.join(' ')) ?? false;
      if (failed) {
        const output = new TextEncoder().encode('command failed\n');
        this.onmessage?.({ data: new Uint8Array([0x02, ...output]).buffer });
      }
      this.onmessage?.({
        data: new Uint8Array([0x03, failed ? 1 : 0]).buffer,
      });
      this.onclose?.({ code: 1000, reason: '' });
    }, 0);
  }

  send(): void {}
  close(): void {
    this.onclose?.({ code: 1000, reason: '' });
  }
}

beforeEach(() => {
  calls = [];
  execCommands = [];
  execWorkingDirectory = '/home/sprite';
  execFailingCommand = undefined;
  vi.stubGlobal('WebSocket', FakeExecWebSocket as unknown);
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

    // Readable slug + deterministic SHA-256 suffix binding the full sessionId.
    expect(session.id).toMatch(/^ai-sdk-harness-session-run-7-[0-9a-f]{10}$/);
    expect(session.defaultWorkingDirectory).toBe('/home/sprite');
    expect([...session.ports]).toEqual([8080]);

    const create = calls.find(
      c => c.method === 'POST' && c.url.endsWith('/v1/sprites'),
    );
    expect(JSON.parse(create?.body ?? '{}').name).toBe(session.id);
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
    expect(session.id).toMatch(/^ai-sdk-harness-session-s1-[0-9a-f]{10}$/);
    expect(onFirstCreate).not.toHaveBeenCalled();
    // fell back to GET
    expect(calls.some(c => c.method === 'GET')).toBe(true);
  });

  it('reuses an existing sprite on a 400 duplicate-name response', async () => {
    installFetch({ createStatus: 400 });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const onFirstCreate = vi.fn(async () => {});
    const session = await provider.createSession({
      sessionId: 's1',
      onFirstCreate,
    });
    expect(session.id).toMatch(/^ai-sdk-harness-session-s1-[0-9a-f]{10}$/);
    expect(onFirstCreate).not.toHaveBeenCalled();
    // fell back to GET
    expect(calls.some(c => c.method === 'GET')).toBe(true);
  });

  it('throws the original create error when a 400 create fails and no existing sprite is found', async () => {
    installFetch({ createStatus: 400, spriteExists: false });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    await expect(provider.createSession({ sessionId: 's1' })).rejects.toThrow(
      /failed: 400/,
    );
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

  it('rejects when create fails with a non-409 error', async () => {
    installFetch({ createStatus: 500 });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    await expect(provider.createSession({ sessionId: 's1' })).rejects.toThrow(
      /failed: 500/,
    );
  });
});

describe('create-new pnpm setup', () => {
  it('installs pnpm before onFirstCreate runs', async () => {
    installFetch();
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const commandsBeforeFirstCreate: string[][] = [];
    await provider.createSession({
      sessionId: 's1',
      onFirstCreate: async () => {
        commandsBeforeFirstCreate.push(...execCommands);
      },
    });

    expect(commandsBeforeFirstCreate).toHaveLength(2);
    expect(commandsBeforeFirstCreate[0]).toEqual(['pwd']);
    expect(commandsBeforeFirstCreate[1].join(' ')).toMatch(
      /^bash -c command -v pnpm /,
    );
  });

  it('installs nothing in a wrapped Sprite', async () => {
    installFetch({ auth: 'public' });
    await createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
    }).createSession();

    expect(execCommands).toEqual([['pwd']]);
  });
});

describe('deprecated provider cleanup on failed setup', () => {
  it('deletes the Sprite it created when url auth cannot be set', async () => {
    installFetch({ auth: 'sprite', urlAuthStatus: 500 });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      name: 'half-made',
    });

    await expect(provider.createSession()).rejects.toThrow(/failed: 500/);
    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/half-made')),
    ).toBe(true);
  });

  it('deletes the Sprite it created when pnpm cannot be installed', async () => {
    installFetch();
    execFailingCommand = /pnpm/;
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      name: 'half-made',
    });

    await expect(provider.createSession()).rejects.toThrow(
      'Failed to install pnpm in the Sprite (exit 1): command failed',
    );
    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/half-made')),
    ).toBe(true);
  });

  it('deletes the Sprite it created when onFirstCreate fails', async () => {
    installFetch();
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      name: 'half-made',
    });

    await expect(
      provider.createSession({
        onFirstCreate: async () => {
          throw new Error('install failed');
        },
      }),
    ).rejects.toThrow('install failed');
    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/half-made')),
    ).toBe(true);
  });

  it('keeps a Sprite that already existed when setup fails', async () => {
    installFetch({ createStatus: 409, markerExists: false });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });

    await expect(
      provider.createSession({
        identity: 'h',
        onFirstCreate: async () => {
          throw new Error('install failed');
        },
      }),
    ).rejects.toThrow('install failed');
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
  });

  it('never deletes a wrapped Sprite when url auth cannot be set', async () => {
    installFetch({ auth: 'sprite', urlAuthStatus: 500 });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
      urlAuth: 'public',
    });

    await expect(provider.createSession()).rejects.toThrow(/failed: 500/);
    await expect(
      provider.resumeSession?.({ sessionId: 'ignored' }),
    ).rejects.toThrow(/failed: 500/);
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
  });
});

describe('deprecated provider working directory', () => {
  it('reads the default working directory from the Sprite', async () => {
    installFetch({ auth: 'public' });
    execWorkingDirectory = '/workspace/';
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const wrapping = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
    });

    const created = await provider.createSession({ sessionId: 's1' });
    const resumed = await provider.resumeSession?.({ sessionId: 's1' });
    const wrapped = await wrapping.createSession();
    const wrappedResumed = await wrapping.resumeSession?.({ sessionId: 's1' });

    expect(created.defaultWorkingDirectory).toBe('/workspace');
    expect(resumed?.defaultWorkingDirectory).toBe('/workspace');
    expect(wrapped.defaultWorkingDirectory).toBe('/workspace');
    expect(wrappedResumed?.defaultWorkingDirectory).toBe('/workspace');
  });

  it('writes the bootstrap marker under the directory the Sprite reports', async () => {
    installFetch();
    execWorkingDirectory = '/workspace';
    await createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    }).createSession({ identity: 'h', onFirstCreate: async () => {} });

    const markerWrite = calls.find(
      c => c.method === 'PUT' && c.url.includes('/fs/write'),
    );
    expect(new URL(markerWrite?.url ?? '').searchParams.get('path')).toMatch(
      /^\/workspace\/\.ai-sdk-harness\/bootstrap-h-[0-9a-f]{10}\.done$/,
    );
  });

  it('uses workingDirectory without asking the Sprite', async () => {
    installFetch({ auth: 'public' });
    const session = await createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
      workingDirectory: '/srv/app',
    }).createSession();

    expect(session.defaultWorkingDirectory).toBe('/srv/app');
    expect(execCommands).toEqual([]);
  });
});

describe('prewarm / identity', () => {
  it('derives a reusable template name from identity and runs onFirstCreate once, writing a marker', async () => {
    installFetch();
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const onFirstCreate = vi.fn(async () => {});
    const session = await provider.createSession({
      identity: 'recipe-hash-1',
      onFirstCreate,
    });
    expect(session.id).toMatch(
      /^ai-sdk-harness-tmpl-recipe-hash-1-[0-9a-f]{10}$/,
    );
    expect(onFirstCreate).toHaveBeenCalledTimes(1);
    // marker persisted via fs/write to a path keyed by identity, using the
    // same collision-resistant derivation as the sprite name.
    const markerWrite = calls.find(
      c => c.method === 'PUT' && c.url.includes('/fs/write'),
    );
    expect(markerWrite?.url).toMatch(
      /bootstrap-recipe-hash-1-[0-9a-f]{10}\.done/,
    );
  });

  it('skips onFirstCreate when the identity marker already exists (409 reuse)', async () => {
    installFetch({ createStatus: 409, markerExists: true });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const onFirstCreate = vi.fn(async () => {});
    await provider.createSession({ identity: 'h', onFirstCreate });
    expect(onFirstCreate).not.toHaveBeenCalled();
  });

  it('re-runs onFirstCreate when the Sprite exists but the marker is absent', async () => {
    installFetch({ createStatus: 409, markerExists: false });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const onFirstCreate = vi.fn(async () => {});
    await provider.createSession({ identity: 'h', onFirstCreate });
    expect(onFirstCreate).toHaveBeenCalledTimes(1);
  });
});

describe('getPortEndpoint', () => {
  it('maps the proxied port 8080 to the public URL with the requested scheme', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'p' });
    // The fake control-plane serves the public URL as `<name>-x.sprites.app`.
    const host = `${session.id}-x.sprites.app`;

    expect(await session.getPortEndpoint({ port: 8080 })).toEqual({
      url: `https://${host}/`,
    });
    expect(
      await session.getPortEndpoint({ port: 8080, protocol: 'ws' }),
    ).toEqual({ url: `wss://${host}/` });
    expect(
      await session.getPortEndpoint({ port: 8080, protocol: 'http' }),
    ).toEqual({ url: `https://${host}/` });
  });

  it('throws for any non-proxied port', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'p' });
    await expect(session.getPortEndpoint({ port: 3000 })).rejects.toThrow(
      /8080/,
    );
  });

  it('keeps getPortUrl as a compatibility wrapper', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const session = await provider.createSession({ sessionId: 'p' });

    expect(await session.getPortUrl({ port: 8080, protocol: 'ws' })).toBe(
      `wss://${session.id}-x.sprites.app/`,
    );
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
    expect(session?.id).toMatch(/^ai-sdk-harness-session-s1-[0-9a-f]{10}$/);
    expect(
      calls.some(c => c.method === 'GET' && c.url.endsWith(session?.id ?? '')),
    ).toBe(true);
  });

  it('re-derives the identical name createSession produced for the same sessionId', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const created = await provider.createSession({ sessionId: 'weird/../id' });
    const resumed = await provider.resumeSession?.({
      sessionId: 'weird/../id',
    });
    expect(resumed?.id).toBe(created.id);
  });

  it('derives collision-resistant names for distinct ids whose slugs collide', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    // Two distinct ids that sanitize to the same lossy 40-char slug the old
    // implementation used (identical first 40 alphanumerics), differing only
    // beyond it. The SHA-256 suffix over the full value must keep them apart.
    const a = `${'a'.repeat(45)}-one`;
    const b = `${'a'.repeat(45)}-two`;
    const sa = await provider.createSession({ sessionId: a });
    const sb = await provider.createSession({ sessionId: b });
    expect(sa.id).not.toBe(sb.id);
    // Both remain DNS-label-safe and within the 63-char limit.
    for (const id of [sa.id, sb.id]) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(id.length).toBeLessThanOrEqual(63);
    }
  });

  it('reconciles urlAuth for a wrapped Sprite on resume, mirroring createSession', async () => {
    installFetch({ auth: 'sprite' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
      urlAuth: 'public',
    });
    const session = await provider.resumeSession?.({ sessionId: 'ignored' });
    expect(session?.id).toBe('my-existing');
    // url auth was sprite -> provider PUTs public, same as createSession
    const put = calls.find(c => c.method === 'PUT');
    expect(put?.body).toContain('"auth":"public"');
  });

  it('does not change url auth for a wrapped Sprite already on the requested auth', async () => {
    installFetch({ auth: 'public' });
    const provider = createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
      urlAuth: 'public',
    });
    await provider.resumeSession?.({ sessionId: 'ignored' });
    expect(calls.some(c => c.method === 'PUT')).toBe(false);
  });
});

describe('createSpritesNetworkSandboxSession', () => {
  it('creates a Sprite named with sandboxId and puts it on public url auth', async () => {
    installFetch({ auth: 'sprite' });
    const session = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
    });

    expect(session.id).toBe('my-sandbox');
    expect([...session.ports]).toEqual([8080]);
    const create = calls.find(
      c => c.method === 'POST' && c.url.endsWith('/v1/sprites'),
    );
    expect(JSON.parse(create?.body ?? '{}')).toEqual({ name: 'my-sandbox' });
    const put = calls.find(c => c.method === 'PUT');
    expect(put?.body).toContain('"auth":"public"');
  });

  it('assigns a random name when no sandboxId is given', async () => {
    installFetch();
    const first = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const second = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });

    expect(first.id).toMatch(/^ai-sdk-harness-[0-9a-f]{12}$/);
    expect(second.id).not.toBe(first.id);
  });

  it('reads the default working directory from the Sprite', async () => {
    installFetch();
    execWorkingDirectory = '/workspace/';
    const session = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });

    expect(session.defaultWorkingDirectory).toBe('/workspace');
    expect(execCommands[0]).toEqual(['pwd']);
  });

  it('uses workingDirectory without asking the Sprite', async () => {
    installFetch();
    const session = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      workingDirectory: '/srv/app',
    });

    expect(session.defaultWorkingDirectory).toBe('/srv/app');
    expect(execCommands.some(argv => argv[0] === 'pwd')).toBe(false);
  });

  it('fails on a name conflict instead of reusing the existing Sprite', async () => {
    installFetch({ createStatus: 409 });

    await expect(
      createSpritesNetworkSandboxSession({
        apiKey: 'tok',
        baseUrl: 'https://api.test',
        sandboxId: 'taken',
      }),
    ).rejects.toThrow(/a Sprite named "taken" already exists/);
    // The existing Sprite belongs to someone else: it is left untouched.
    expect(calls.some(c => c.method === 'PUT')).toBe(false);
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
  });

  it('keeps sprite url auth when asked to', async () => {
    installFetch({ auth: 'sprite' });
    await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      urlAuth: 'sprite',
    });

    expect(calls.some(c => c.method === 'PUT')).toBe(false);
  });

  it('installs pnpm in the new Sprite before preparing the template', async () => {
    installFetch();
    const commandsBeforePrepare: string[][] = [];
    await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      template: {
        identity: 'recipe-hash-1',
        prepare: async () => {
          commandsBeforePrepare.push(...execCommands);
        },
      },
    });

    expect(commandsBeforePrepare).toEqual([
      ['pwd'],
      [
        'bash',
        '-c',
        'command -v pnpm >/dev/null 2>&1 || { corepack enable --install-directory /usr/local/bin pnpm && corepack prepare pnpm@11 --activate; }',
      ],
    ]);
  });

  it('deletes the new Sprite when pnpm cannot be installed', async () => {
    installFetch();
    execFailingCommand = /pnpm/;
    const prepare = vi.fn(async () => {});

    await expect(
      createSpritesNetworkSandboxSession({
        apiKey: 'tok',
        baseUrl: 'https://api.test',
        sandboxId: 'no-pnpm',
        template: { identity: 'recipe-hash-1', prepare },
      }),
    ).rejects.toThrow(
      'Failed to install pnpm in the Sprite (exit 1): command failed',
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/no-pnpm')),
    ).toBe(true);
  });

  it('prepares the template in the new Sprite with the restricted session', async () => {
    installFetch();
    const abortSignal = new AbortController().signal;
    const prepare = vi.fn(async () => {});
    const session = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      template: { identity: 'recipe-hash-1', prepare },
      abortSignal,
    });

    expect(prepare).toHaveBeenCalledTimes(1);
    const [prepareOptions] = prepare.mock.calls[0] as unknown as [
      { session: object; abortSignal?: AbortSignal },
    ];
    expect(prepareOptions.abortSignal).toBe(abortSignal);
    expect(prepareOptions.session).not.toBe(session);
    expect('destroy' in prepareOptions.session).toBe(false);
    expect('getPortEndpoint' in prepareOptions.session).toBe(false);
  });

  it('deletes the new Sprite when template preparation fails', async () => {
    installFetch();

    await expect(
      createSpritesNetworkSandboxSession({
        apiKey: 'tok',
        baseUrl: 'https://api.test',
        sandboxId: 'half-made',
        template: {
          identity: 'recipe-hash-1',
          prepare: async () => {
            throw new Error('install failed');
          },
        },
      }),
    ).rejects.toThrow('install failed');
    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/half-made')),
    ).toBe(true);
  });

  it('destroy() deletes the Sprite', async () => {
    installFetch();
    const session = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'short-lived',
    });
    await session.stop();
    await session.destroy();

    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/short-lived')),
    ).toBe(true);
  });

  it('rejects spriteName, which belongs to the resume function', async () => {
    installFetch();

    await expect(
      createSpritesNetworkSandboxSession({
        apiKey: 'tok',
        spriteName: 'my-existing',
      } as never),
    ).rejects.toThrow(/resumeSpritesNetworkSandboxSession/);
    expect(calls).toEqual([]);
  });

  it('does nothing when already aborted', async () => {
    installFetch();

    await expect(
      createSpritesNetworkSandboxSession({
        apiKey: 'tok',
        abortSignal: AbortSignal.abort(new Error('stopped')),
      }),
    ).rejects.toThrow('stopped');
    expect(calls).toEqual([]);
  });
});

describe('resumeSpritesNetworkSandboxSession', () => {
  it('reattaches to the Sprite named sandboxId without creating one', async () => {
    installFetch({ auth: 'public' });
    const session = await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
    });

    expect(session.id).toBe('my-sandbox');
    expect(session.defaultWorkingDirectory).toBe('/home/sprite');
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'GET /v1/sprites/my-sandbox',
    ]);
    // An existing Sprite is reattached as it is: nothing is installed in it.
    expect(execCommands).toEqual([['pwd']]);
  });

  it('fails when the Sprite does not exist and never creates it', async () => {
    installFetch({ spriteExists: false });

    await expect(
      resumeSpritesNetworkSandboxSession({
        apiKey: 'tok',
        baseUrl: 'https://api.test',
        sandboxId: 'gone',
      }),
    ).rejects.toThrow(/failed: 404/);
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('returns the same endpoint as the session that created the Sprite', async () => {
    installFetch({ auth: 'public' });
    const created = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    });
    const resumed = await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: created.id,
    });

    const endpoint = await created.getPortEndpoint({
      port: 8080,
      protocol: 'ws',
    });
    expect(endpoint).toEqual({ url: `wss://${created.id}-x.sprites.app/` });
    // Stable across repeated resolution and across reattaching.
    expect(
      await created.getPortEndpoint({ port: 8080, protocol: 'ws' }),
    ).toEqual(endpoint);
    expect(
      await resumed.getPortEndpoint({ port: 8080, protocol: 'ws' }),
    ).toEqual(endpoint);
  });

  it('changes url auth only when asked to', async () => {
    installFetch({ auth: 'sprite' });
    await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
    });
    expect(calls.some(c => c.method === 'PUT')).toBe(false);

    await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
      urlAuth: 'public',
    });
    expect(calls.find(c => c.method === 'PUT')?.body).toContain(
      '"auth":"public"',
    );
  });

  it('destroy() deletes the reattached Sprite', async () => {
    installFetch({ auth: 'public' });
    const session = await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
    });
    await session.destroy();

    expect(
      calls.some(c => c.method === 'DELETE' && c.url.endsWith('/my-sandbox')),
    ).toBe(true);
  });
});

describe('authentication errors', () => {
  it('reports a missing API key as a sandbox authentication error', async () => {
    installFetch();

    const error = await createSpritesNetworkSandboxSession().catch(
      (error: unknown) => error,
    );
    expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: expect.stringMatching(/API key is required/),
      sandboxProviderId: 'sprites-sandbox',
    });
    await expect(
      resumeSpritesNetworkSandboxSession({ sandboxId: 'my-sandbox' }),
    ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
    expect(() => createSpritesSandbox({})).toThrow(
      HarnessSandboxAuthenticationError,
    );
    expect(calls).toEqual([]);
  });

  it.each([401, 403])(
    'reports a %i from creating a Sprite as a sandbox authentication error',
    async status => {
      installFetch({ createStatus: status });

      const error = await createSpritesNetworkSandboxSession({
        apiKey: 'bad',
        baseUrl: 'https://api.test',
      }).catch((error: unknown) => error);
      expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
      expect(error).toMatchObject({
        message: expect.stringMatching(/Sprites authentication failed/),
        sandboxProviderId: 'sprites-sandbox',
        cause: { status },
      });
    },
  );

  it('reports rejected credentials on resume and through the deprecated provider', async () => {
    installFetch({ lookupStatus: 401 });

    await expect(
      resumeSpritesNetworkSandboxSession({
        apiKey: 'bad',
        baseUrl: 'https://api.test',
        sandboxId: 'my-sandbox',
      }),
    ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
    await expect(
      createSpritesSandbox({
        apiKey: 'bad',
        baseUrl: 'https://api.test',
        spriteName: 'my-existing',
      }).createSession(),
    ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
    await expect(
      createSpritesSandbox({
        apiKey: 'bad',
        baseUrl: 'https://api.test',
      }).resumeSession?.({ sessionId: 's1' }),
    ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
  });

  it.each([401, 403])(
    'reports a %i from setting url auth through the deprecated provider as a sandbox authentication error',
    async status => {
      installFetch({ auth: 'sprite', urlAuthStatus: status });
      const provider = createSpritesSandbox({
        apiKey: 'bad',
        baseUrl: 'https://api.test',
      });
      const wrapping = createSpritesSandbox({
        apiKey: 'bad',
        baseUrl: 'https://api.test',
        spriteName: 'my-existing',
        urlAuth: 'public',
      });

      await expect(
        provider.createSession({ sessionId: 's1' }),
      ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
      await expect(wrapping.createSession()).rejects.toSatisfy(
        HarnessSandboxAuthenticationError.isInstance,
      );
      await expect(
        wrapping.resumeSession?.({ sessionId: 'ignored' }),
      ).rejects.toSatisfy(HarnessSandboxAuthenticationError.isInstance);
    },
  );

  it('leaves other API failures as they are', async () => {
    installFetch({ createStatus: 500 });

    const error = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
    }).catch((error: unknown) => error);
    expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(false);
    expect(error).toMatchObject({ message: expect.stringMatching(/500/) });
  });
});

describe('bridge port and url auth', () => {
  it('exposes no port on a Sprite created with sprite url auth', async () => {
    installFetch({ auth: 'sprite' });
    const session = await createSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'private',
      urlAuth: 'sprite',
    });

    expect([...session.ports]).toEqual([]);
    const error = await Promise.resolve(
      session.getPortEndpoint({ port: 8080, protocol: 'ws' }),
    ).catch((error: unknown) => error);
    expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      message: expect.stringMatching(
        /Sprite "private" is not on public URL auth/,
      ),
    });
    await expect(session.getPortUrl({ port: 8080 })).rejects.toThrow(
      /not on public URL auth/,
    );
  });

  it('exposes the port on resume only once the Sprite is public', async () => {
    installFetch({ auth: 'sprite' });
    const asFound = await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
    });
    expect([...asFound.ports]).toEqual([]);

    const madePublic = await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'my-sandbox',
      urlAuth: 'public',
    });
    expect([...madePublic.ports]).toEqual([8080]);
    expect(
      await madePublic.getPortEndpoint({ port: 8080, protocol: 'ws' }),
    ).toEqual({ url: 'wss://my-sandbox-x.sprites.app/' });
  });

  it('exposes the port on a wrapped Sprite that the deprecated provider made public', async () => {
    installFetch({ auth: 'sprite' });
    const wrappedAsFound = await createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
    }).createSession();
    expect([...wrappedAsFound.ports]).toEqual([]);

    const wrappedMadePublic = await createSpritesSandbox({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      spriteName: 'my-existing',
      urlAuth: 'public',
    }).createSession();
    expect([...wrappedMadePublic.ports]).toEqual([8080]);
  });

  it('exposes no port when the API does not report the url auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: 'sprite-unknown',
              name: 'unknown',
              url: 'https://unknown-x.sprites.app',
            }),
            { status: 200 },
          ),
      ),
    );
    const session = await resumeSpritesNetworkSandboxSession({
      apiKey: 'tok',
      baseUrl: 'https://api.test',
      sandboxId: 'unknown',
    });

    expect([...session.ports]).toEqual([]);
  });
});
