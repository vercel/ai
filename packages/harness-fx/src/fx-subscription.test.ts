import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFxAuthentication } from './fx-subscription';

const scope = 'https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828';
let directory: string;
const expiresAt = 2_000_000_000_000;
const fxCredentials = (accessToken: string) => ({
  version: 1,
  access_token: accessToken,
  refresh_token: 'refresh',
  account_id: 'account',
  expires_at_ms: expiresAt,
});
const codexCredentials = {
  auth_mode: 'chatgpt',
  tokens: {
    access_token: 'native-codex',
    refresh_token: 'refresh',
    account_id: 'account',
    id_token: 'preserve-id',
  },
  extra: true,
};
const grokCredentials = {
  [scope]: {
    key: 'native-grok',
    refresh_token: 'refresh',
    user_id: 'account',
    expires_at: new Date(expiresAt).toISOString(),
    extra: true,
  },
  other: { key: 'preserve' },
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fx-subscription-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function put(options: { file: string; value: unknown }) {
  const filePath = join(directory, options.file);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(options.value));
}
function resolveAuth(
  options: Partial<Parameters<typeof resolveFxAuthentication>[0]> = {},
) {
  return resolveFxAuthentication({
    env: {},
    homeDirectory: directory,
    ...options,
  });
}

describe('fx subscription discovery', () => {
  it('uses fx Codex, fx Grok, native Codex, then native Grok', async () => {
    const sources = [
      {
        file: '.fx/chatgpt-auth.json',
        value: fxCredentials('fx-codex'),
        provider: 'codex',
        token: 'fx-codex',
      },
      {
        file: '.fx/grok-auth.json',
        value: fxCredentials('fx-grok'),
        provider: 'grok',
        token: 'fx-grok',
      },
      {
        file: '.codex/auth.json',
        value: codexCredentials,
        provider: 'codex',
        token: 'native-codex',
      },
      {
        file: '.grok/auth.json',
        value: grokCredentials,
        provider: 'grok',
        token: 'native-grok',
      },
    ];
    for (const source of sources) await put(source);
    for (const source of sources) {
      const auth = await resolveAuth();
      expect(auth.provider).toBe(source.provider);
      if (auth.provider === 'gateway') throw new Error('Expected subscription');
      expect((await auth.subscription.read()).accessToken).toBe(source.token);
      await unlink(join(directory, source.file));
    }
    await expect(resolveAuth()).rejects.toThrow(
      'No subscription credentials were available',
    );
  });

  it.each([undefined, 'auto', 'ai-gateway'] as const)(
    'prefers Gateway with %s',
    async auth => {
      await put({
        file: '.fx/chatgpt-auth.json',
        value: fxCredentials('subscription'),
      });
      expect(
        await resolveAuth({ auth, env: { AI_GATEWAY_API_KEY: 'gateway' } }),
      ).toEqual({
        provider: 'gateway',
        apiKey: 'gateway',
        baseUrl: 'https://ai-gateway.vercel.sh',
      });
    },
  );

  it('discovers subscriptions in direct mode and retains Gateway fallback', async () => {
    await put({
      file: '.fx/chatgpt-auth.json',
      value: fxCredentials('subscription'),
    });
    expect(
      (
        await resolveAuth({
          auth: 'direct',
          env: { AI_GATEWAY_API_KEY: 'gateway' },
        })
      ).provider,
    ).toBe('codex');
    await unlink(join(directory, '.fx/chatgpt-auth.json'));
    expect(
      (
        await resolveAuth({
          auth: 'direct',
          env: { VERCEL_OIDC_TOKEN: 'gateway' },
        })
      ).provider,
    ).toBe('gateway');
  });

  it('isolates explicit authentication environments', async () => {
    await put({
      file: '.fx/chatgpt-auth.json',
      value: fxCredentials('subscription'),
    });
    await expect(
      resolveAuth({ auth: {}, env: { AI_GATEWAY_API_KEY: 'host' } }),
    ).rejects.toThrow('fx requires');
    expect(
      (await resolveAuth({ auth: { AI_GATEWAY_API_KEY: 'explicit' } }))
        .provider,
    ).toBe('gateway');
    await expect(resolveAuth({ auth: 'ai-gateway' })).rejects.toThrow(
      'fx requires',
    );
  });

  it('skips malformed stores and ignores native API-key records', async () => {
    await put({ file: '.fx/chatgpt-auth.json', value: { version: 2 } });
    await put({ file: '.fx/grok-auth.json', value: {} });
    await put({
      file: '.codex/auth.json',
      value: { auth_mode: 'apikey', OPENAI_API_KEY: 'ignore' },
    });
    await put({ file: '.grok/auth.json', value: grokCredentials });
    expect((await resolveAuth()).provider).toBe('grok');
  });

  it('honors native home overrides', async () => {
    await put({ file: 'custom-codex/auth.json', value: codexCredentials });
    await put({ file: 'custom-grok/auth.json', value: grokCredentials });
    const env = {
      CODEX_HOME: join(directory, 'custom-codex'),
      GROK_HOME: join(directory, 'custom-grok'),
    };
    expect((await resolveAuth({ env })).provider).toBe('codex');
    await unlink(join(directory, 'custom-codex/auth.json'));
    expect((await resolveAuth({ env })).provider).toBe('grok');
  });

  it('pins the provider on resume without overriding an explicit Gateway mode', async () => {
    await put({ file: '.fx/chatgpt-auth.json', value: fxCredentials('codex') });
    await put({ file: '.fx/grok-auth.json', value: fxCredentials('grok') });
    expect(
      (
        await resolveAuth({
          requiredProvider: 'grok',
          env: { AI_GATEWAY_API_KEY: 'gateway' },
        })
      ).provider,
    ).toBe('grok');
    expect(
      (
        await resolveAuth({
          requiredProvider: 'gateway',
          auth: 'direct',
          env: { AI_GATEWAY_API_KEY: 'gateway' },
        })
      ).provider,
    ).toBe('gateway');
    await expect(
      resolveAuth({ requiredProvider: 'codex', auth: 'ai-gateway' }),
    ).rejects.toThrow('does not allow');
    await unlink(join(directory, '.fx/chatgpt-auth.json'));
    await expect(
      resolveAuth({
        requiredProvider: 'codex',
        env: { AI_GATEWAY_API_KEY: 'gateway' },
      }),
    ).rejects.toThrow('no codex subscription');
  });
});

describe('fx subscription persistence', () => {
  it.each(['chatgpt', 'grok'])(
    'rereads and updates the selected fx %s store',
    async name => {
      const file = `.fx/${name}-auth.json`;
      await put({ file, value: { ...fxCredentials('initial'), extra: true } });
      const auth = await resolveAuth();
      if (auth.provider === 'gateway') throw new Error('Expected subscription');
      await put({
        file,
        value: { ...fxCredentials('external-rotation'), extra: true },
      });
      expect((await auth.subscription.read()).accessToken).toBe(
        'external-rotation',
      );
      await auth.subscription.write({
        credentials: {
          accessToken: 'rotated',
          refreshToken: 'rotated-refresh',
          accountId: 'account',
          expiresAt: expiresAt + 1000,
        },
      });
      expect(JSON.parse(await readFile(join(directory, file), 'utf8')))
        .toMatchInlineSnapshot(`
      {
        "access_token": "rotated",
        "account_id": "account",
        "expires_at_ms": 2000000001000,
        "extra": true,
        "refresh_token": "rotated-refresh",
        "version": 1,
      }
    `);
      if (process.platform !== 'win32')
        expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
      expect(await readdir(join(directory, '.fx'))).toEqual([
        `${name}-auth.json`,
      ]);
      await unlink(join(directory, file));
      await expect(auth.subscription.read()).rejects.toThrow(
        'no longer available',
      );
      await expect(
        auth.subscription.write({ credentials: { accessToken: 'lost' } }),
      ).rejects.toThrow('Cannot update');
    },
  );

  it('preserves native Codex metadata and derives JWT expiry', async () => {
    const token = `header.${Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString('base64url')}.signature`;
    await put({
      file: '.codex/auth.json',
      value: {
        ...codexCredentials,
        tokens: { ...codexCredentials.tokens, access_token: token },
      },
    });
    const auth = await resolveAuth();
    if (auth.provider === 'gateway') throw new Error('Expected subscription');
    expect((await auth.subscription.read()).expiresAt).toBe(expiresAt);
    await auth.subscription.write({ credentials: { accessToken: 'rotated' } });
    const saved = JSON.parse(
      await readFile(join(directory, '.codex/auth.json'), 'utf8'),
    );
    expect(saved.tokens).toMatchInlineSnapshot(`
      {
        "access_token": "rotated",
        "account_id": "account",
        "id_token": "preserve-id",
        "refresh_token": "refresh",
      }
    `);
    expect(saved.extra).toBe(true);
    expect(Date.parse(saved.last_refresh)).not.toBeNaN();
  });

  it.each([new Date(expiresAt).toISOString(), expiresAt, expiresAt / 1000])(
    'reads Grok expiry %s and writes native-compatible timestamps',
    async expiry => {
      await put({
        file: '.grok/auth.json',
        value: {
          ...grokCredentials,
          [scope]: { ...grokCredentials[scope], expires_at: expiry },
        },
      });
      const auth = await resolveAuth();
      if (auth.provider === 'gateway') throw new Error('Expected subscription');
      expect(await auth.subscription.read()).toEqual({
        accessToken: 'native-grok',
        refreshToken: 'refresh',
        accountId: 'account',
        expiresAt,
      });
      await auth.subscription.write({
        credentials: { accessToken: 'rotated', expiresAt: expiresAt + 1000 },
      });
      const saved = JSON.parse(
        await readFile(join(directory, '.grok/auth.json'), 'utf8'),
      );
      expect(saved).toEqual({
        ...grokCredentials,
        [scope]: {
          ...grokCredentials[scope],
          key: 'rotated',
          expires_at: new Date(expiresAt + 1000).toISOString(),
        },
      });
    },
  );

  it('does not fall back after a selected store disappears', async () => {
    await put({
      file: '.fx/chatgpt-auth.json',
      value: fxCredentials('selected'),
    });
    await put({ file: '.fx/grok-auth.json', value: fxCredentials('fallback') });
    const auth = await resolveAuth();
    if (auth.provider === 'gateway') throw new Error('Expected subscription');
    await unlink(join(directory, '.fx/chatgpt-auth.json'));
    await expect(auth.subscription.read()).rejects.toThrow(
      'no longer available',
    );
  });
});

describe('native Codex credential stores', () => {
  it.each(['file', 'keyring', 'auto', 'ephemeral'])(
    'honors %s mode',
    async mode => {
      await put({ file: '.codex/auth.json', value: codexCredentials });
      await mkdir(join(directory, '.codex'), { recursive: true });
      await writeFile(
        join(directory, '.codex/config.toml'),
        `cli_auth_credentials_store = "${mode}"\n`,
      );
      let stored = JSON.stringify({
        ...codexCredentials,
        tokens: { ...codexCredentials.tokens, access_token: 'keyring' },
      });
      const keyring = {
        read: vi.fn(async () => stored),
        write: vi.fn(async ({ value }: { value: string }) => {
          stored = value;
        }),
      };
      if (mode === 'ephemeral') {
        await expect(resolveAuth({ keyring })).rejects.toThrow(
          'No subscription credentials',
        );
        expect(keyring.read).not.toHaveBeenCalled();
        return;
      }
      const auth = await resolveAuth({ keyring });
      if (auth.provider === 'gateway') throw new Error('Expected subscription');
      expect((await auth.subscription.read()).accessToken).toBe(
        mode === 'file' ? 'native-codex' : 'keyring',
      );
      await auth.subscription.write({
        credentials: { accessToken: 'rotated' },
      });
      if (mode === 'file') expect(keyring.read).not.toHaveBeenCalled();
      else {
        const account = `cli|${createHash('sha256')
          .update(await realpath(join(directory, '.codex')))
          .digest('hex')
          .slice(0, 16)}`;
        expect(keyring.read).toHaveBeenCalledWith({
          service: 'Codex Auth',
          account,
        });
        expect(JSON.parse(stored).tokens.access_token).toBe('rotated');
        expect(
          JSON.parse(
            await readFile(join(directory, '.codex/auth.json'), 'utf8'),
          ).tokens.access_token,
        ).toBe('native-codex');
        keyring.write.mockRejectedValueOnce(new Error('write failed'));
        await expect(
          auth.subscription.write({ credentials: { accessToken: 'failure' } }),
        ).rejects.toThrow('write failed');
      }
    },
  );

  it('falls back to the file in auto mode when the keyring has no credentials', async () => {
    await put({ file: '.codex/auth.json', value: codexCredentials });
    await writeFile(
      join(directory, '.codex/config.toml'),
      'cli_auth_credentials_store = "auto"',
    );
    const auth = await resolveAuth({
      keyring: { read: async () => undefined, write: async () => {} },
    });
    if (auth.provider === 'gateway') throw new Error('Expected subscription');
    expect((await auth.subscription.read()).accessToken).toBe('native-codex');
  });
});
