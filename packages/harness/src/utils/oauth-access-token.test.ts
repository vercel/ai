import { describe, expect, it, vi } from 'vitest';
import {
  isAccessTokenExpiringSoon,
  refreshOAuthAccessToken,
} from './oauth-access-token';

describe('isAccessTokenExpiringSoon', () => {
  it('uses an inclusive five minute refresh window', () => {
    expect(
      isAccessTokenExpiringSoon({ expiresAt: 400_000, now: 100_000 }),
    ).toBe(true);
    expect(
      isAccessTokenExpiringSoon({ expiresAt: 400_001, now: 100_000 }),
    ).toBe(false);
  });

  it('supports a custom refresh window', () => {
    expect(
      isAccessTokenExpiringSoon({
        expiresAt: 102_000,
        now: 100_000,
        refreshWindowMs: 2_000,
      }),
    ).toBe(true);
  });
});

describe('refreshOAuthAccessToken', () => {
  it('sends a form refresh grant and preserves an omitted refresh token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const fetch = vi.fn(async () =>
      Response.json({ access_token: 'access', expires_in: 60 }),
    );

    await expect(
      refreshOAuthAccessToken({
        tokenUrl: 'https://example.com/token',
        clientId: 'client',
        refreshToken: 'refresh',
        fetch,
      }),
    ).resolves.toEqual({ accessToken: 'access', expiresAt: 61_000 });
    expect(fetch).toHaveBeenCalledWith('https://example.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&client_id=client&refresh_token=refresh',
    });
    vi.useRealTimers();
  });

  it('sends JSON and returns a rotated refresh token', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        access_token: 'access',
        refresh_token: 'rotated',
        expires_in: 60,
      }),
    );

    await expect(
      refreshOAuthAccessToken({
        tokenUrl: 'https://example.com/token',
        clientId: 'client',
        refreshToken: 'refresh',
        requestFormat: 'json',
        headers: { 'x-client': 'test' },
        fetch,
      }),
    ).resolves.toMatchObject({
      accessToken: 'access',
      refreshToken: 'rotated',
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({
      headers: {
        'content-type': 'application/json',
        'x-client': 'test',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: 'client',
        refresh_token: 'refresh',
      }),
    });
  });

  it('derives expiry from a JWT exp claim', async () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1234 })).toString(
      'base64url',
    );
    const fetch = vi.fn(async () =>
      Response.json({ access_token: `header.${payload}.signature` }),
    );

    await expect(
      refreshOAuthAccessToken({
        tokenUrl: 'https://example.com/token',
        clientId: 'client',
        refreshToken: 'refresh',
        fetch,
      }),
    ).resolves.toEqual({
      accessToken: `header.${payload}.signature`,
      expiresAt: 1_234_000,
    });
  });

  it('rejects unsuccessful and malformed responses without exposing tokens', async () => {
    await expect(
      refreshOAuthAccessToken({
        tokenUrl: 'https://example.com/token',
        clientId: 'client',
        refreshToken: 'sensitive-refresh-token',
        fetch: async () => new Response('sensitive response', { status: 401 }),
      }),
    ).rejects.toThrow('OAuth access token refresh failed with status 401.');

    await expect(
      refreshOAuthAccessToken({
        tokenUrl: 'https://example.com/token',
        clientId: 'client',
        refreshToken: 'refresh',
        fetch: async () => Response.json({ access_token: 'not-a-jwt' }),
      }),
    ).rejects.toThrow(
      'OAuth access token refresh response does not include a usable expiry.',
    );
  });
});
