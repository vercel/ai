import { describe, expect, it } from 'vitest';
import {
  createOpenCodeRequestTransformations,
  resolveOpenCodeAuthenticationMode,
  resolveOpenCodeEnv,
  resolveOpenCodeProvider,
  splitOpenCodeModel,
  toOpenCodeGatewayBaseUrl,
} from './opencode-auth';

describe('OpenCode auth', () => {
  it('resolves provider from explicit provider or model prefix', () => {
    expect(resolveOpenCodeProvider({ provider: 'openai' })).toBe('openai');
    expect(resolveOpenCodeProvider({ model: 'openai/gpt-5.1' })).toBe('openai');
    expect(
      resolveOpenCodeProvider({ model: 'anthropic/claude-sonnet-4-5' }),
    ).toBe('anthropic');
    expect(resolveOpenCodeProvider({ model: 'custom/model' })).toBe(
      'anthropic',
    );
  });

  it('splits provider-prefixed models', () => {
    expect(
      splitOpenCodeModel('anthropic/claude-sonnet-4-5', undefined),
    ).toEqual({
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
      model: 'anthropic/claude-sonnet-4-5',
    });
    expect(splitOpenCodeModel('gpt-5.1', 'openai')).toEqual({
      providerID: 'openai',
      modelID: 'gpt-5.1',
      model: 'openai/gpt-5.1',
    });
  });

  it('uses AI Gateway env including OIDC fallback', () => {
    expect(
      resolveOpenCodeEnv({
        auth: undefined,
        processEnv: {
          VERCEL_OIDC_TOKEN: 'oidc-token',
          AI_GATEWAY_BASE_URL: 'https://gateway.example',
        },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'oidc-token',
      AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
    });
  });

  it('prefers the selected direct provider before ambient gateway fallback', () => {
    expect(
      resolveOpenCodeEnv({
        auth: 'openai',
        provider: 'openai',
        processEnv: {
          OPENAI_API_KEY: 'openai-key',
          AI_GATEWAY_API_KEY: 'gateway-key',
          AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
        },
      }),
    ).toEqual({ OPENAI_API_KEY: 'openai-key' });
  });

  it('uses a supplied authentication environment instead of ambient credentials', () => {
    const auth = { OPENAI_API_KEY: 'programmatic-openai-key' };

    expect(
      resolveOpenCodeEnv({
        auth,
        provider: 'openai',
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toEqual({ OPENAI_API_KEY: 'programmatic-openai-key' });
    expect(
      resolveOpenCodeAuthenticationMode({
        auth,
        provider: 'openai',
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toBe('openai');
  });

  it('rejects nested authentication objects before reading ambient credentials', () => {
    const auth = { openai: { apiKey: 'legacy-key' } } as never;

    expect(() =>
      resolveOpenCodeEnv({
        auth,
        provider: 'openai',
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
    expect(() =>
      resolveOpenCodeAuthenticationMode({
        auth,
        provider: 'openai',
        processEnv: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });

  it('normalizes OpenCode gateway base URLs to /v1', () => {
    expect(toOpenCodeGatewayBaseUrl('https://ai-gateway.vercel.sh')).toBe(
      'https://ai-gateway.vercel.sh/v1',
    );
    expect(toOpenCodeGatewayBaseUrl('https://ai-gateway.vercel.sh/v1')).toBe(
      'https://ai-gateway.vercel.sh/v1',
    );
  });

  it('supports string authentication modes', () => {
    expect(
      resolveOpenCodeEnv({
        auth: 'openai',
        provider: 'openai',
        processEnv: {
          OPENAI_API_KEY: 'sk-openai',
          OPENAI_BASE_URL: 'https://compat.example/v1',
        },
      }),
    ).toEqual({
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://compat.example/v1',
    });

    expect(
      resolveOpenCodeEnv({
        auth: 'ai-gateway',
        processEnv: { AI_GATEWAY_API_KEY: 'gw-mode' },
      }),
    ).toEqual({
      AI_GATEWAY_API_KEY: 'gw-mode',
      AI_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh/v1',
    });
  });
});

describe('resolveOpenCodeAuthenticationMode', () => {
  it('preserves selected-provider auth despite ambient Gateway credentials', () => {
    expect(
      resolveOpenCodeAuthenticationMode({
        auth: 'openai',
        provider: 'openai',
        processEnv: { AI_GATEWAY_API_KEY: 'gateway-key' },
      }),
    ).toBe('openai');
  });

  it('resolves ambient Gateway credentials to Gateway auth', () => {
    expect(
      resolveOpenCodeAuthenticationMode({
        auth: undefined,
        processEnv: { VERCEL_OIDC_TOKEN: 'oidc-token' },
      }),
    ).toBe('ai-gateway');
  });
});

describe('createOpenCodeRequestTransformations', () => {
  it('uses the resolved OpenAI route', () => {
    expect(
      createOpenCodeRequestTransformations({
        env: {
          OPENAI_API_KEY: 'openai-secret',
          OPENAI_BASE_URL: 'https://openai.example/v1',
          AI_GATEWAY_API_KEY: 'unselected-gateway-secret',
          AI_GATEWAY_BASE_URL: 'https://unselected-gateway.example/v1',
        },
        sandboxEnv: { OPENAI_API_KEY: 'sandbox-openai-secret' },
        auth: 'openai',
      }),
    ).toEqual([
      {
        match: {
          host: 'openai.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-openai-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer openai-secret' },
        },
      },
    ]);
  });

  it('matches both supported Gateway credential headers', () => {
    expect(
      createOpenCodeRequestTransformations({
        env: {
          OPENAI_API_KEY: 'unselected-openai-secret',
          OPENAI_BASE_URL: 'https://unselected-openai.example/v1',
          AI_GATEWAY_API_KEY: 'gateway-secret',
          AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
        },
        sandboxEnv: {
          AI_GATEWAY_API_KEY: 'sandbox-gateway-secret',
        },
        auth: 'ai-gateway',
      }),
    ).toEqual([
      {
        match: {
          host: 'gateway.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'x-api-key' },
              value: { exact: 'sandbox-gateway-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer gateway-secret' },
        },
      },
      {
        match: {
          host: 'gateway.example',
          path: { startsWith: '/v1' },
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-gateway-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer gateway-secret' },
        },
      },
    ]);
  });

  it('injects both supported Anthropic credential headers', () => {
    expect(
      createOpenCodeRequestTransformations({
        env: {
          ANTHROPIC_API_KEY: 'api-secret',
          ANTHROPIC_AUTH_TOKEN: 'token-secret',
        },
        sandboxEnv: {
          ANTHROPIC_API_KEY: 'sandbox-api-secret',
          ANTHROPIC_AUTH_TOKEN: 'sandbox-token-secret',
        },
        auth: 'anthropic',
      }),
    ).toEqual([
      {
        match: {
          host: 'api.anthropic.com',
          headers: [
            {
              key: { exact: 'x-api-key' },
              value: { exact: 'sandbox-api-secret' },
            },
          ],
        },
        transform: {
          headers: { 'x-api-key': 'api-secret' },
        },
      },
      {
        match: {
          host: 'api.anthropic.com',
          headers: [
            {
              key: { exact: 'Authorization' },
              value: { exact: 'Bearer sandbox-token-secret' },
            },
          ],
        },
        transform: {
          headers: { Authorization: 'Bearer token-secret' },
        },
      },
    ]);
  });
});
