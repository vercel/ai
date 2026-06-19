import { describe, expect, it } from 'vitest';
import {
  resolveDeepAgentsEnv,
  resolveDeepAgentsProvider,
} from './deepagents-auth';

describe('resolveDeepAgentsProvider', () => {
  it('reads the provider from a slash/colon model string', () => {
    expect(resolveDeepAgentsProvider({ model: 'openai/gpt-5' })).toBe('openai');
    expect(resolveDeepAgentsProvider({ model: 'anthropic:claude-x' })).toBe(
      'anthropic',
    );
  });

  it('defaults to anthropic', () => {
    expect(resolveDeepAgentsProvider({ model: 'claude-sonnet-4' })).toBe(
      'anthropic',
    );
    expect(resolveDeepAgentsProvider({})).toBe('anthropic');
  });

  it('infers openai when only openai auth is configured', () => {
    expect(
      resolveDeepAgentsProvider({ auth: { openai: { apiKey: 'k' } } }),
    ).toBe('openai');
  });
});

describe('resolveDeepAgentsEnv', () => {
  it('pins explicit anthropic auth', () => {
    const env = resolveDeepAgentsEnv({
      auth: {
        anthropic: { apiKey: 'sk-ant', baseUrl: 'https://example.test' },
      },
      processEnv: {},
    });
    expect(env).toEqual({
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_BASE_URL: 'https://example.test',
    });
  });

  it('pins explicit openai auth for an openai model', () => {
    const env = resolveDeepAgentsEnv({
      model: 'openai/gpt-5',
      auth: { openai: { apiKey: 'sk-oai', organization: 'org_1' } },
      processEnv: {},
    });
    expect(env.OPENAI_API_KEY).toBe('sk-oai');
    expect(env.OPENAI_ORGANIZATION).toBe('org_1');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('routes an anthropic model through the gateway (no /v1 suffix)', () => {
    const env = resolveDeepAgentsEnv({
      auth: { gateway: { apiKey: 'gw-key' } },
      processEnv: {},
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_API_KEY).toBe('gw-key');
    expect(env.ANTHROPIC_BASE_URL).toBe('https://ai-gateway.vercel.sh');
    expect(env.OPENAI_BASE_URL).toBeUndefined();
  });

  it('routes an openai model through the gateway (with /v1 suffix)', () => {
    const env = resolveDeepAgentsEnv({
      model: 'openai/gpt-5',
      auth: { gateway: { apiKey: 'gw-key' } },
      processEnv: {},
    });
    expect(env.OPENAI_API_KEY).toBe('gw-key');
    expect(env.OPENAI_BASE_URL).toBe('https://ai-gateway.vercel.sh/v1');
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it('falls back to ambient gateway env before ambient provider creds', () => {
    const env = resolveDeepAgentsEnv({
      processEnv: {
        AI_GATEWAY_API_KEY: 'ambient-gw',
        ANTHROPIC_API_KEY: 'ambient-ant',
      },
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('ambient-gw');
    expect(env.ANTHROPIC_API_KEY).toBe('ambient-gw');
  });

  it('falls back to ambient OIDC token as the gateway key', () => {
    const env = resolveDeepAgentsEnv({
      processEnv: { VERCEL_OIDC_TOKEN: 'oidc-token' },
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('oidc-token');
  });

  it('falls back to ambient anthropic when no gateway creds exist', () => {
    const env = resolveDeepAgentsEnv({
      processEnv: { ANTHROPIC_API_KEY: 'ambient-ant' },
    });
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'ambient-ant' });
  });

  it('falls back to ambient openai creds for an openai model', () => {
    const env = resolveDeepAgentsEnv({
      model: 'openai/gpt-5',
      processEnv: { OPENAI_API_KEY: 'ambient-oai' },
    });
    expect(env).toEqual({ OPENAI_API_KEY: 'ambient-oai' });
  });
});
