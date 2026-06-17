import { describe, expect, it } from 'vitest';
import { resolveGrokBuildEnv } from './grok-build-auth';

describe('resolveGrokBuildEnv', () => {
  it('uses explicit xai api key', () => {
    const env = resolveGrokBuildEnv({ xai: { apiKey: 'sk-explicit' } }, {});
    expect(env.XAI_API_KEY).toBe('sk-explicit');
  });

  it('falls back to XAI_API_KEY from process env', () => {
    const env = resolveGrokBuildEnv(undefined, { XAI_API_KEY: 'sk-env' });
    expect(env.XAI_API_KEY).toBe('sk-env');
  });

  it('prefers gateway auth from env over direct xai', () => {
    const env = resolveGrokBuildEnv(undefined, {
      AI_GATEWAY_API_KEY: 'gw-key',
      XAI_API_KEY: 'sk-env',
    });
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-key');
  });

  it('pins to explicit gateway when given', () => {
    const env = resolveGrokBuildEnv(
      { gateway: { apiKey: 'gw-explicit' } },
      { XAI_API_KEY: 'sk-env' },
    );
    expect(env.AI_GATEWAY_API_KEY).toBe('gw-explicit');
  });

  it('passes through a custom base url', () => {
    const env = resolveGrokBuildEnv(
      { xai: { apiKey: 'k', baseUrl: 'https://x' } },
      {},
    );
    expect(env.XAI_BASE_URL).toBe('https://x');
  });
});
