import { describe, expect, it } from 'vitest';
import { configureOpenCodeServerAuth } from './opencode-server-auth';

describe('configureOpenCodeServerAuth', () => {
  it('configures a random password and matching authorization header', () => {
    const env: Record<string, string | undefined> = {};

    const headers = configureOpenCodeServerAuth({ env });

    expect(env.OPENCODE_SERVER_PASSWORD).toMatch(/^[0-9a-f]{64}$/);
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`opencode:${env.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`,
    );
  });

  it('uses the configured OpenCode server username', () => {
    const env: Record<string, string | undefined> = {
      OPENCODE_SERVER_USERNAME: 'custom-user',
    };

    const headers = configureOpenCodeServerAuth({ env });

    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from(`custom-user:${env.OPENCODE_SERVER_PASSWORD}`).toString('base64')}`,
    );
  });
});
