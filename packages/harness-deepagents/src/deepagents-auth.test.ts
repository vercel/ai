import { describe, expect, it } from 'vitest';
import { resolveDeepAgentsEnv } from './deepagents-auth';

describe('resolveDeepAgentsEnv', () => {
  it('pins explicit anthropic auth', () => {
    const env = resolveDeepAgentsEnv(
      { anthropic: { apiKey: 'sk-ant', baseUrl: 'https://example.test' } },
      {},
    );
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_BASE_URL: 'https://example.test',
    });
  });

  it('pins explicit gateway auth and mirrors it onto ANTHROPIC_*', () => {
    const env = resolveDeepAgentsEnv({ gateway: { apiKey: 'gw-key' } }, {});
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_API_KEY).toBe('gw-key');
    expect(env.AI_GATEWAY_BASE_URL).toBe('https://ai-gateway.vercel.sh');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
  });

  it('falls back to ambient gateway env before ambient anthropic', () => {
    const env = resolveDeepAgentsEnv(undefined, {
      AI_GATEWAY_API_KEY: 'ambient-gw',
      ANTHROPIC_API_KEY: 'ambient-ant',
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('ambient-gw');
    expect(env.ANTHROPIC_API_KEY).toBe('ambient-gw');
  });

  it('falls back to ambient OIDC token as gateway key', () => {
    const env = resolveDeepAgentsEnv(undefined, {
      VERCEL_OIDC_TOKEN: 'oidc-token',
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('oidc-token');
  });

  it('falls back to ambient anthropic when no gateway creds exist', () => {
    const env = resolveDeepAgentsEnv(undefined, {
      ANTHROPIC_API_KEY: 'ambient-ant',
    });
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'ambient-ant' });
  });
});
