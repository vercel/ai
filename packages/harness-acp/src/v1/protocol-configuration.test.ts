import { describe, expect, it } from 'vitest';
import {
  assertACPAgentCapability,
  assertACPAuthenticationMethod,
  createACPInitializeRequest,
  resolveACPAuthentication,
  resolveACPLaunchEnvironment,
  validateACPProtocolVersion,
} from './protocol-configuration';

const gateway = {
  apiKey: 'gateway-key',
  baseUrl: 'https://gateway.example',
  clientAppName: 'ai-sdk/harness-acp',
  clientAppVersion: '0.0.0-test',
};

describe('ACP protocol configuration', () => {
  it('negotiates v1 with versioned client information and no invented capabilities', () => {
    expect(
      createACPInitializeRequest({
        protocolVersion: 1,
        authentication: undefined,
        providerAuthentication: undefined,
        gateway: undefined,
      }),
    ).toEqual({
      protocolVersion: 1,
      clientInfo: {
        name: '@ai-sdk/harness-acp',
        version: '0.0.0-test',
      },
      clientCapabilities: {},
    });
  });

  it('does not combine direct ACP authentication with a Gateway auth method', () => {
    const providerAuthentication = {
      type: 'ai-gateway',
      route: {
        type: 'auth-method',
        methodId: 'gateway',
        clientCapabilities: {
          auth: { _meta: { gateway: true } },
        },
      },
    } as const;
    const authentication = resolveACPAuthentication({
      authentication: {
        methodId: 'api-key',
        clientCapabilities: {
          custom: { direct: true },
        },
      },
      providerAuthentication,
    });

    expect(authentication).toBeUndefined();
    expect(
      createACPInitializeRequest({
        protocolVersion: 1,
        authentication,
        providerAuthentication,
        gateway,
      }).clientCapabilities,
    ).toEqual({
      auth: { _meta: { gateway: true } },
    });
  });

  it('resolves Gateway-only launch environment for an advertised route', () => {
    const providerAuthentication = {
      type: 'ai-gateway',
      route: {
        type: 'auth-method',
        methodId: 'gateway',
        env: {
          CODEX_CONFIG: '{"model":"openai/gpt-5.5"}',
          PROVIDER_BASE_URL: {
            $source: 'gateway-base-url',
            ensureSuffix: '/v1',
          },
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

  it('rejects non-string Gateway launch environment values', () => {
    expect(() =>
      resolveACPLaunchEnvironment({
        providerAuthentication: {
          type: 'ai-gateway',
          route: {
            type: 'session',
            env: { INVALID_VALUE: true },
            meta: {},
          },
        },
        gateway,
      }),
    ).toThrow(
      'ACP Gateway launch environment value for INVALID_VALUE must resolve to a string.',
    );
  });

  it('merges boolean session configuration support with configured capabilities', () => {
    expect(
      createACPInitializeRequest({
        protocolVersion: 1,
        authentication: {
          methodId: 'api-key',
          clientCapabilities: {
            session: {
              _meta: { direct: true },
              configOptions: { _meta: { existing: true } },
            },
          },
        },
        providerAuthentication: {
          type: 'ai-gateway',
          route: {
            type: 'provider-method',
            method: 'providers/set',
            advertisedCapability: ['providers', 'set'],
            clientCapabilities: {
              session: { configOptions: { _meta: { gateway: true } } },
            },
            params: {},
          },
        },
        gateway,
        supportsBooleanSessionConfigOptions: true,
      }).clientCapabilities,
    ).toEqual({
      session: {
        _meta: { direct: true },
        configOptions: {
          boolean: {},
          _meta: { existing: true, gateway: true },
        },
      },
    });
  });

  it.each([
    {
      type: 'launch',
      env: { AI_GATEWAY_API_KEY: { $source: 'gateway-api-key' } },
    },
    {
      type: 'session',
      meta: { gateway: { $source: 'gateway-base-url' } },
    },
    {
      type: 'provider-method',
      method: 'providers/set',
      advertisedCapability: ['providers', 'set'],
      params: { apiKey: { $source: 'gateway-api-key' } },
    },
  ] as const)(
    'retains direct ACP authentication for a Gateway $type route',
    route => {
      const authentication = { methodId: 'api-key' } as const;

      expect(
        resolveACPAuthentication({
          authentication,
          providerAuthentication: {
            type: 'ai-gateway',
            route,
          },
        }),
      ).toBe(authentication);
    },
  );

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

  it('requires provider-method capabilities to be advertised', () => {
    expect(() =>
      assertACPAgentCapability({
        capabilities: { providers: { set: true } },
        path: ['providers', 'set'],
      }),
    ).not.toThrow();
    expect(() =>
      assertACPAgentCapability({
        capabilities: { providers: {} },
        path: ['providers', 'set'],
      }),
    ).toThrow('unadvertised agent capability providers.set');
  });
});
