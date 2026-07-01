import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveEveClientOptions } from './eve-auth';

const mocks = vi.hoisted(() => ({
  vercelOidc: vi.fn(
    (
      options: {
        readonly expirationBufferMs?: number;
        readonly project?: string;
        readonly team?: string;
      } = {},
    ) =>
      async () => ({
        headers: {
          authorization: `Bearer oidc:${options.team ?? 'default'}:${options.project ?? 'default'}:${options.expirationBufferMs ?? 'default'}`,
        },
      }),
  ),
}));

vi.mock('eve/agents/auth', () => ({
  vercelOidc: mocks.vercelOidc,
}));

describe('resolveEveClientOptions', () => {
  beforeEach(() => {
    mocks.vercelOidc.mockClear();
  });

  it('uses Eve Vercel OIDC auth by default', async () => {
    const options = resolveEveClientOptions({
      settings: { url: 'https://eve.test' },
      env: { VERCEL_OIDC_TOKEN: 'oidc-token' },
    });

    expect(options.host).toBe('https://eve.test');
    expect(options.redirect).toBe('manual');
    expect(options.preserveCompletedSessions).toBe(true);
    expect(options.auth).toHaveProperty('vercelOidc');

    if (!options.auth || !('vercelOidc' in options.auth)) {
      throw new Error('Expected Vercel OIDC auth.');
    }

    const token = options.auth.vercelOidc.token;
    expect(typeof token === 'function' ? await token() : token).toBe(
      'oidc:default:default:default',
    );
    expect(mocks.vercelOidc).toHaveBeenCalledWith({});
  });

  it('can disable auth entirely', () => {
    const options = resolveEveClientOptions({
      settings: { url: new URL('https://eve.test'), auth: 'none' },
      env: {},
    });

    expect(options.host).toBe('https://eve.test/');
    expect(options.auth).toBeUndefined();
    expect(options.redirect).toBeUndefined();
  });

  it('uses Eve Vercel OIDC auth for remote auto auth without an ambient token', async () => {
    const options = resolveEveClientOptions({
      settings: { url: 'https://eve.test' },
      env: {},
    });

    if (!options.auth || !('vercelOidc' in options.auth)) {
      throw new Error('Expected Vercel OIDC auth.');
    }

    const token = options.auth.vercelOidc.token;
    expect(typeof token === 'function' ? await token() : token).toBe(
      'oidc:default:default:default',
    );
  });

  it('allows local auto auth without an OIDC token', () => {
    const options = resolveEveClientOptions({
      settings: { url: 'http://localhost:3000' },
      env: {},
    });

    expect(options.auth).toBeUndefined();
    expect(options.redirect).toBeUndefined();
  });

  it('adds the Vercel automation bypass header when available', async () => {
    const options = resolveEveClientOptions({
      settings: {
        url: 'https://eve.test',
        auth: 'none',
        headers: async () => ({ 'x-user-header': 'value' }),
      },
      env: {
        VERCEL_AUTOMATION_BYPASS_SECRET: ' bypass-secret ',
      },
    });

    const headers =
      typeof options.headers === 'function'
        ? await options.headers()
        : options.headers;

    expect(headers).toEqual({
      'x-vercel-protection-bypass': 'bypass-secret',
      'x-user-header': 'value',
    });
  });

  it('uses Eve Vercel OIDC auth options without an explicit token', async () => {
    const options = resolveEveClientOptions({
      settings: {
        url: 'https://eve.test',
        auth: {
          type: 'vercel-oidc',
          team: 'team_test',
          project: 'prj_test',
          expirationBufferMs: 123,
        },
      },
      env: {},
    });

    if (!options.auth || !('vercelOidc' in options.auth)) {
      throw new Error('Expected Vercel OIDC auth.');
    }

    const token = options.auth.vercelOidc.token;
    expect(typeof token === 'function' ? await token() : token).toBe(
      'oidc:team_test:prj_test:123',
    );
    expect(mocks.vercelOidc).toHaveBeenCalledWith({
      expirationBufferMs: 123,
      project: 'prj_test',
      team: 'team_test',
    });
  });

  it('passes explicit Vercel OIDC tokens through without Eve auth resolution', async () => {
    const options = resolveEveClientOptions({
      settings: {
        url: 'https://eve.test',
        auth: { type: 'vercel-oidc', token: 'explicit-token' },
      },
      env: {},
    });

    if (!options.auth || !('vercelOidc' in options.auth)) {
      throw new Error('Expected Vercel OIDC auth.');
    }

    const token = options.auth.vercelOidc.token;
    expect(typeof token === 'function' ? await token() : token).toBe(
      'explicit-token',
    );
    expect(mocks.vercelOidc).not.toHaveBeenCalled();
  });

  it('passes explicit bearer and basic auth through to the Eve client', () => {
    expect(
      resolveEveClientOptions({
        settings: {
          url: 'https://eve.test',
          auth: { type: 'bearer', token: 'bearer-token' },
        },
      }).auth,
    ).toEqual({ bearer: 'bearer-token' });

    expect(
      resolveEveClientOptions({
        settings: {
          url: 'https://eve.test',
          auth: {
            type: 'basic',
            username: 'user',
            password: 'password',
          },
        },
      }).auth,
    ).toEqual({
      basic: {
        username: 'user',
        password: 'password',
      },
    });
  });
});
