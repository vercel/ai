import { describe, expect, it } from 'vitest';
import {
  assertACPAuthenticationMethod,
  createACPInitializeRequest,
  resolveACPLaunchEnvironment,
  validateACPProtocolVersion,
} from './protocol-configuration';

const gateway = {
  apiKey: 'gateway-key',
  baseUrl: 'https://gateway.example',
  clientAppName: 'ai-sdk/harness-acp',
  clientAppVersion: '0.0.0-test',
};

const clientApp = {
  name: 'custom-client',
  version: '1.2.3',
} as const;

describe('ACP protocol configuration', () => {
  it('negotiates v1 with versioned client information and no invented capabilities', () => {
    expect(
      createACPInitializeRequest({
        protocolVersion: 1,
        clientApp,
        authentication: undefined,
      }),
    ).toEqual({
      protocolVersion: 1,
      clientInfo: {
        name: 'custom-client',
        version: '1.2.3',
      },
      clientCapabilities: {},
    });
  });

  it('resolves the Gateway launch environment', () => {
    const providerAuthentication = {
      type: 'ai-gateway',
      env: {
        CODEX_CONFIG: '{"model":"openai/gpt-5.5"}',
        PROVIDER_BASE_URL: {
          $source: 'gateway-base-url',
          ensureSuffix: '/v1',
        },
      },
    } as const;

    expect(
      resolveACPLaunchEnvironment({ providerAuthentication, gateway }),
    ).toEqual({
      CODEX_CONFIG: '{"model":"openai/gpt-5.5"}',
      PROVIDER_BASE_URL: 'https://gateway.example/v1',
    });
    expect(
      resolveACPLaunchEnvironment({
        providerAuthentication: { type: 'direct' },
        gateway: undefined,
      }),
    ).toEqual({});
  });

  it('serializes structured Gateway launch environment values as JSON', () => {
    expect(
      resolveACPLaunchEnvironment({
        providerAuthentication: {
          type: 'ai-gateway',
          env: {
            CODEX_CONFIG: {
              model: 'openai/gpt-5.5',
              model_providers: {
                ai_gateway: {
                  base_url: {
                    $source: 'gateway-base-url',
                    ensureSuffix: '/v1',
                  },
                },
              },
            },
          },
        },
        gateway,
      }),
    ).toEqual({
      CODEX_CONFIG:
        '{"model":"openai/gpt-5.5","model_providers":{"ai_gateway":{"base_url":"https://gateway.example/v1"}}}',
    });
  });

  it('resolves client attribution headers in structured Codex configuration', () => {
    expect(
      resolveACPLaunchEnvironment({
        providerAuthentication: {
          type: 'ai-gateway',
          env: {
            CODEX_CONFIG: {
              model_providers: {
                ai_gateway: {
                  http_headers: {
                    'User-Agent': { $source: 'client-app' },
                    'x-client-app': { $source: 'client-app' },
                  },
                },
              },
            },
          },
        },
        gateway,
      }),
    ).toEqual({
      CODEX_CONFIG:
        '{"model_providers":{"ai_gateway":{"http_headers":{"User-Agent":"ai-sdk/harness-acp/0.0.0-test","x-client-app":"ai-sdk/harness-acp/0.0.0-test"}}}}',
    });
  });

  it('merges boolean session configuration support with configured capabilities', () => {
    expect(
      createACPInitializeRequest({
        protocolVersion: 1,
        clientApp,
        authentication: {
          methodId: 'api-key',
          clientCapabilities: {
            session: {
              _meta: { direct: true },
              configOptions: { _meta: { existing: true } },
            },
          },
        },
        clientCapabilities: {
          _meta: { parameterizedModelPicker: true },
        },
        supportsBooleanSessionConfigOptions: true,
      }).clientCapabilities,
    ).toEqual({
      _meta: { parameterizedModelPicker: true },
      session: {
        _meta: { direct: true },
        configOptions: {
          boolean: {},
          _meta: { existing: true },
        },
      },
    });
  });

  it('validates protocol versions and advertised authentication methods', () => {
    expect(() =>
      validateACPProtocolVersion({
        requested: 1,
        initialization: { protocolVersion: 2 },
      }),
    ).toThrow('requested v1, agent selected v2');
    expect(() =>
      assertACPAuthenticationMethod({
        initialization: {
          protocolVersion: 1,
          authMethods: [{ id: 'api-key' }],
        },
        methodId: 'gateway',
      }),
    ).toThrow('is not advertised by the agent');
    expect(() =>
      assertACPAuthenticationMethod({
        initialization: {
          protocolVersion: 1,
          authMethods: [{ id: 'gateway' }],
        },
        methodId: 'gateway',
      }),
    ).not.toThrow();
  });
});
