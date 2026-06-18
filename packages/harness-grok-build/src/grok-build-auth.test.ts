import { describe, expect, it } from 'vitest';
import { resolveGrokBuildEnv, toGrokCliEnv } from './grok-build-auth';

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

describe('toGrokCliEnv', () => {
  it('maps direct xai auth to XAI_API_KEY', () => {
    const resolved = resolveGrokBuildEnv({ xai: { apiKey: 'sk-direct' } }, {});
    const cliEnv = toGrokCliEnv(resolved);
    expect(cliEnv.XAI_API_KEY).toBe('sk-direct');
    expect(cliEnv.GROK_CODE_XAI_API_KEY).toBeUndefined();
    expect(cliEnv.GROK_MODELS_BASE_URL).toBeUndefined();
  });

  it('forwards a direct custom base url', () => {
    const cliEnv = toGrokCliEnv(
      resolveGrokBuildEnv({ xai: { apiKey: 'k', baseUrl: 'https://x' } }, {}),
    );
    expect(cliEnv.XAI_BASE_URL).toBe('https://x');
  });

  it('maps gateway auth to GROK_CODE_XAI_API_KEY + GROK_MODELS_BASE_URL', () => {
    const resolved = resolveGrokBuildEnv(
      { gateway: { apiKey: 'gw-key', baseUrl: 'https://gateway.example/v1' } },
      {},
    );
    const cliEnv = toGrokCliEnv(resolved);
    expect(cliEnv.GROK_CODE_XAI_API_KEY).toBe('gw-key');
    expect(cliEnv.GROK_MODELS_BASE_URL).toBe('https://gateway.example/v1');
    // The direct xAI var must not leak when routing through the gateway.
    expect(cliEnv.XAI_API_KEY).toBeUndefined();
  });
});
