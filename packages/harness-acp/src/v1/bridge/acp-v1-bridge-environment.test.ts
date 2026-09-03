import { describe, expect, it } from 'vitest';
import {
  ACP_BRIDGE_CONFIGURATION_ENV,
  createACPBridgeEnvironment,
  readACPBridgeEnvironment,
} from './acp-v1-bridge-environment';

describe('ACP bridge environment', () => {
  it('round-trips fixed authentication and session configuration', async () => {
    const configuration = {
      authentication: {
        methodId: 'api-key',
        meta: {
          apiKey: 'direct-secret',
        },
      },
      providerAuthentication: {
        type: 'ai-gateway',
        env: {
          AI_GATEWAY_API_KEY: { $source: 'gateway-api-key' },
          AI_GATEWAY_BASE_URL: { $source: 'gateway-base-url' },
          CLIENT_APP: { $source: 'client-app' },
          CLIENT_APP_NAME: { $source: 'client-app-name' },
          CLIENT_APP_VERSION: { $source: 'client-app-version' },
        },
      },
      providerEnvironment: {
        AI_GATEWAY_API_KEY: 'AI_GATEWAY_API_KEY',
        AI_GATEWAY_BASE_URL: 'https://gateway.example/v1',
      },
      sessionMeta: {
        opaqueCredential: 'session-secret',
      },
      clientCapabilities: {
        _meta: {
          parameterizedModelPicker: true,
        },
      },
    } as const;

    const env = createACPBridgeEnvironment(configuration);

    await expect(readACPBridgeEnvironment({ env })).resolves.toEqual(
      configuration,
    );
  });

  it('returns empty configuration when the environment variable is absent', async () => {
    await expect(readACPBridgeEnvironment({ env: {} })).resolves.toEqual({});
  });

  it('round-trips a Gateway launch environment', async () => {
    const configuration = {
      providerAuthentication: {
        type: 'ai-gateway',
        env: {
          CODEX_CONFIG: '{"model":"openai/gpt-5.5"}',
        },
      },
    } as const;

    await expect(
      readACPBridgeEnvironment({
        env: createACPBridgeEnvironment(configuration),
      }),
    ).resolves.toEqual(configuration);
  });

  it('does not expose invalid environment contents in its error', async () => {
    const secret = 'invalid-secret';
    const error = await readACPBridgeEnvironment({
      env: {
        [ACP_BRIDGE_CONFIGURATION_ENV]: `{${secret}`,
      },
    }).catch(error => error);

    expect(error).toEqual(
      new Error('ACP bridge configuration environment is invalid.'),
    );
    expect(String(error)).not.toContain(secret);
  });

  it('rejects configuration that does not match the schema', async () => {
    await expect(
      readACPBridgeEnvironment({
        env: {
          [ACP_BRIDGE_CONFIGURATION_ENV]: JSON.stringify({
            providerAuthentication: {
              type: 'ai-gateway',
              env: [],
            },
          }),
        },
      }),
    ).rejects.toThrow('ACP bridge configuration environment is invalid.');
  });
});
