import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCursorSubscription,
  resolveCursorSubscriptionEnvironment,
  resolveCursorAuthPath,
} from './cursor-subscription';

describe('resolveCursorSubscriptionEnvironment', () => {
  it('does not inspect subscriptions for Gateway auth', async () => {
    await expect(
      resolveCursorSubscriptionEnvironment({
        auth: 'ai-gateway',
        env: { AI_GATEWAY_API_KEY: 'gateway' },
      }),
    ).resolves.toEqual({ AI_GATEWAY_API_KEY: 'gateway' });
  });

  it('prefers CURSOR_API_KEY over native storage', async () => {
    await expect(
      resolveCursorSubscriptionEnvironment({
        auth: 'direct',
        env: { CURSOR_API_KEY: 'environment-key' },
      }),
    ).resolves.toEqual({ CURSOR_API_KEY: 'environment-key' });
  });
});

describe('readCursorSubscription', () => {
  it('reads a file-backed browser access token', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'cursor-auth-'));
    const cursorDirectory = join(homeDirectory, '.cursor');
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(cursorDirectory, { recursive: true }),
    );
    await writeFile(
      join(cursorDirectory, 'auth.json'),
      JSON.stringify({
        accessToken: 'opaque-access-token',
        refreshToken: 'stored-but-not-forwarded',
      }),
    );
    await expect(
      readCursorSubscription({ homeDirectory, platform: 'darwin' }),
    ).resolves.toBe('opaque-access-token');
  });

  it('rejects an expiring JWT instead of inventing a refresh endpoint', async () => {
    const homeDirectory = await mkdtemp(join(tmpdir(), 'cursor-auth-'));
    const cursorDirectory = join(homeDirectory, '.cursor');
    await import('node:fs/promises').then(({ mkdir }) =>
      mkdir(cursorDirectory, { recursive: true }),
    );
    const accessToken = `header.${Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 }),
    ).toString('base64url')}.signature`;
    await writeFile(
      join(cursorDirectory, 'auth.json'),
      JSON.stringify({ accessToken, refreshToken: 'refresh-token' }),
    );
    await expect(
      readCursorSubscription({ homeDirectory, platform: 'darwin' }),
    ).rejects.toThrow('Run Cursor login again.');
  });
});

describe('resolveCursorAuthPath', () => {
  it('uses each native platform path', () => {
    expect(
      resolveCursorAuthPath({
        env: {},
        homeDirectory: '/home/me',
        platform: 'linux',
      }),
    ).toBe('/home/me/.config/cursor/auth.json');
    expect(
      resolveCursorAuthPath({
        env: { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' },
        homeDirectory: 'C:\\Users\\me',
        platform: 'win32',
      }),
    ).toContain('Cursor/auth.json');
  });
});
