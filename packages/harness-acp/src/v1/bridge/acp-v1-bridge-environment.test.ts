import { describe, expect, it } from 'vitest';
import {
  ACP_BRIDGE_CONFIGURATION_ENV,
  createACPBridgeEnvironment,
  readACPBridgeEnvironment,
} from './acp-v1-bridge-environment';

const agent = {
  command: '/home/agent/.harness-bootstrap/example-acp/home/.local/bin/agent',
  args: ['acp'],
  home: '/home/agent/.harness-bootstrap/example-acp/home',
};

describe('ACP bridge environment', () => {
  it('round-trips the agent launch', async () => {
    await expect(
      readACPBridgeEnvironment({ env: createACPBridgeEnvironment({ agent }) }),
    ).resolves.toEqual({ agent });
  });

  it.each([
    { nonTextContentTypes: [] },
    { nonTextContentTypes: ['image'] as const },
  ])(
    'round-trips non-text content types: %j',
    async ({ nonTextContentTypes }) => {
      const configuration = { agent, nonTextContentTypes };
      await expect(
        readACPBridgeEnvironment({
          env: createACPBridgeEnvironment(configuration),
        }),
      ).resolves.toEqual(configuration);
    },
  );

  it.each([
    { nonTextContentTypes: ['text'] },
    { nonTextContentTypes: ['audio'] },
    { nonTextContentTypes: true },
  ])(
    'rejects invalid non-text content types: %j',
    async ({ nonTextContentTypes }) => {
      await expect(
        readACPBridgeEnvironment({
          env: {
            [ACP_BRIDGE_CONFIGURATION_ENV]: JSON.stringify({
              agent,
              nonTextContentTypes,
            }),
          },
        }),
      ).rejects.toThrow('ACP bridge configuration environment is invalid.');
    },
  );

  it('round-trips fixed authentication and session configuration', async () => {
    const configuration = {
      agent,
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

  it('rejects a missing configuration environment variable', async () => {
    await expect(readACPBridgeEnvironment({ env: {} })).rejects.toThrow(
      'ACP bridge configuration environment is invalid.',
    );
  });

  it('round-trips a Gateway launch environment', async () => {
    const configuration = {
      agent,
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
            agent,
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
