import { describe, expect, it } from 'vitest';
import {
  createACPAuthenticationProfileIdentity,
  resolveACPEnv,
  resolveACPProviderAuthentication,
  resolveACPProviderAuthenticationCompatibility,
} from './acp-auth';
import type { ACPAuthenticationMode, ACPProviderAuthentication } from './v1';

const clientApp = {
  name: 'ai-sdk/harness-acp',
  version: '0.0.0-test',
} as const;

const gatewayEnv = {
  PROVIDER_API_KEY: { $source: 'gateway-api-key' },
  PROVIDER_BASE_URL: { $source: 'gateway-base-url' },
} as const satisfies ACPProviderAuthentication['gateway']['env'];

function resolve({
  mode,
  env,
}: {
  mode?: ACPAuthenticationMode;
  env: Record<string, string | undefined>;
}) {
  return resolveACPProviderAuthentication({
    auth: {
      mode,
      providerAuthentication: {
        gateway: {
          env: gatewayEnv,
        },
      },
      clientApp,
    },
    env,
  });
}

describe('resolveACPProviderAuthentication', () => {
  it('rejects nested authentication objects before reading ambient credentials', () => {
    expect(() =>
      resolve({
        mode: { gateway: { apiKey: 'legacy-key' } } as never,
        env: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });

  it('transports the client app without provider authentication configuration', () => {
    expect(
      resolveACPProviderAuthentication({
        auth: {
          providerAuthentication: undefined,
          clientApp,
        },
        env: {},
      }),
    ).toEqual({
      providerAuthentication: undefined,
      env: {
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
  });

  it('selects AI Gateway automatically for AI_GATEWAY_API_KEY', () => {
    expect(
      resolve({
        env: {
          AI_GATEWAY_API_KEY: 'gateway-key',
          AI_GATEWAY_BASE_URL: 'https://gateway.example',
        },
      }),
    ).toEqual({
      providerAuthentication: { type: 'ai-gateway', env: gatewayEnv },
      env: {
        AI_SDK_ACP_GATEWAY_API_KEY: 'gateway-key',
        AI_SDK_ACP_GATEWAY_BASE_URL: 'https://gateway.example',
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
  });

  it('selects AI Gateway automatically for VERCEL_OIDC_TOKEN', () => {
    expect(resolve({ env: { VERCEL_OIDC_TOKEN: 'oidc-token' } })).toEqual({
      providerAuthentication: { type: 'ai-gateway', env: gatewayEnv },
      env: {
        AI_SDK_ACP_GATEWAY_API_KEY: 'oidc-token',
        AI_SDK_ACP_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
  });

  it('selects direct authentication automatically without Gateway credentials', () => {
    expect(resolve({ env: { DIRECT_PROVIDER_KEY: 'direct-key' } })).toEqual({
      providerAuthentication: { type: 'direct' },
      env: {
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
  });

  it('keeps explicit direct authentication when Gateway credentials are ambient', () => {
    expect(
      resolve({
        mode: 'direct',
        env: { AI_GATEWAY_API_KEY: 'ambient-gateway-key' },
      }),
    ).toEqual({
      providerAuthentication: { type: 'direct' },
      env: {
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
  });

  it('uses the Gateway base URL from the environment', () => {
    expect(
      resolve({
        mode: 'ai-gateway',
        env: {
          AI_GATEWAY_API_KEY: 'ambient-gateway-key',
          AI_GATEWAY_BASE_URL: 'https://configured.example',
        },
      }).env,
    ).toEqual({
      AI_SDK_ACP_GATEWAY_API_KEY: 'ambient-gateway-key',
      AI_SDK_ACP_GATEWAY_BASE_URL: 'https://configured.example',
      AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
      AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
    });
  });

  it('uses a supplied authentication environment without reading the host environment', () => {
    const env = { AI_GATEWAY_API_KEY: 'ambient-gateway-key' };

    expect(
      resolve({
        mode: {
          AI_GATEWAY_API_KEY: 'explicit-gateway-key',
          AI_GATEWAY_BASE_URL: 'https://explicit.example',
        },
        env,
      }).env,
    ).toEqual({
      AI_SDK_ACP_GATEWAY_API_KEY: 'explicit-gateway-key',
      AI_SDK_ACP_GATEWAY_BASE_URL: 'https://explicit.example',
      AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
      AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
    });
    expect(env).toEqual({ AI_GATEWAY_API_KEY: 'ambient-gateway-key' });
  });

  it('fails explicit Gateway selection without credentials', () => {
    expect(() => resolve({ mode: 'ai-gateway', env: {} })).toThrow(
      'neither AI_GATEWAY_API_KEY nor VERCEL_OIDC_TOKEN is set',
    );
  });
});

describe('resolveACPEnv', () => {
  it('returns the environment for the resolved selection', () => {
    expect(
      resolveACPEnv({
        auth: {
          mode: 'ai-gateway',
          providerAuthentication: {
            gateway: {
              env: gatewayEnv,
            },
          },
          clientApp,
        },
        env: { AI_GATEWAY_API_KEY: 'gateway-key' },
      }),
    ).toEqual({
      AI_SDK_ACP_GATEWAY_API_KEY: 'gateway-key',
      AI_SDK_ACP_GATEWAY_BASE_URL: 'https://ai-gateway.vercel.sh',
      AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
      AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
    });
  });
});

describe('resolveACPProviderAuthenticationCompatibility', () => {
  it('records credential source identity without credential values', () => {
    const first = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: {
        gateway: { env: gatewayEnv },
      },
      env: {
        AI_GATEWAY_API_KEY: 'first-secret',
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
      },
    });
    const rotated = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: {
        gateway: { env: gatewayEnv },
      },
      env: {
        AI_GATEWAY_API_KEY: 'rotated-secret',
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
      },
    });
    const oidc = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: {
        gateway: { env: gatewayEnv },
      },
      env: {
        VERCEL_OIDC_TOKEN: 'oidc-secret',
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
      },
    });

    expect(first).toEqual(rotated);
    expect(first).toMatchObject({
      type: 'ai-gateway',
      credentialSource: 'AI_GATEWAY_API_KEY',
      baseUrl: 'https://gateway.example',
    });
    expect(oidc).toMatchObject({
      type: 'ai-gateway',
      credentialSource: 'VERCEL_OIDC_TOKEN',
    });
    expect(JSON.stringify(first)).not.toContain('first-secret');
    expect(JSON.stringify(oidc)).not.toContain('oidc-secret');
  });

  it('records the environment Gateway source and effective base URL', () => {
    const configured = resolveACPProviderAuthenticationCompatibility({
      auth: 'ai-gateway',
      providerAuthentication: {
        gateway: {
          env: gatewayEnv,
        },
      },
      env: {
        AI_GATEWAY_API_KEY: 'ambient-secret',
        AI_GATEWAY_BASE_URL: 'https://ambient.example',
      },
    });

    expect(configured).toMatchObject({
      type: 'ai-gateway',
      credentialSource: 'AI_GATEWAY_API_KEY',
      baseUrl: 'https://ambient.example',
    });
    expect(JSON.stringify(configured)).not.toContain('ambient-secret');
  });

  it('excludes supplied credentials from compatibility identity', () => {
    const first = resolveACPProviderAuthenticationCompatibility({
      auth: {
        AI_GATEWAY_API_KEY: 'first-secret',
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
      },
      providerAuthentication: { gateway: { env: gatewayEnv } },
      env: {},
    });
    const rotated = resolveACPProviderAuthenticationCompatibility({
      auth: {
        AI_GATEWAY_API_KEY: 'rotated-secret',
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
      },
      providerAuthentication: { gateway: { env: gatewayEnv } },
      env: {},
    });

    expect(first).toEqual(rotated);
    expect(first).toMatchObject({
      type: 'ai-gateway',
      mode: 'auto',
      credentialSource: 'AI_GATEWAY_API_KEY',
      baseUrl: 'https://gateway.example',
    });
    expect(JSON.stringify(first)).not.toContain('first-secret');
  });

  it('pins selection, source, and base URL while allowing secret rotation', () => {
    const compatibility = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: {
        gateway: { env: gatewayEnv },
      },
      env: {
        AI_GATEWAY_API_KEY: 'first-secret',
        AI_GATEWAY_BASE_URL: 'https://first.example',
      },
    });
    expect(compatibility?.type).toBe('ai-gateway');

    expect(
      resolveACPProviderAuthentication({
        auth: {
          providerAuthentication: {
            gateway: { env: gatewayEnv },
          },
          clientApp,
        },
        env: {
          AI_GATEWAY_API_KEY: 'rotated-secret',
          AI_GATEWAY_BASE_URL: 'https://changed.example',
        },
        compatibility,
      }),
    ).toEqual({
      providerAuthentication: { type: 'ai-gateway', env: gatewayEnv },
      env: {
        AI_SDK_ACP_GATEWAY_API_KEY: 'rotated-secret',
        AI_SDK_ACP_GATEWAY_BASE_URL: 'https://first.example',
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
    expect(() =>
      resolveACPProviderAuthentication({
        auth: {
          providerAuthentication: {
            gateway: { env: gatewayEnv },
          },
          clientApp,
        },
        env: {
          VERCEL_OIDC_TOKEN: 'different-source-secret',
        },
        compatibility,
      }),
    ).toThrow('AI Gateway authentication was selected');
  });

  it('does not change an auto-direct identity when credentials appear later', () => {
    const compatibility = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: {
        gateway: { env: gatewayEnv },
      },
      env: {},
    });

    expect(
      resolveACPProviderAuthentication({
        auth: {
          providerAuthentication: {
            gateway: { env: gatewayEnv },
          },
          clientApp,
        },
        env: {
          AI_GATEWAY_API_KEY: 'late-secret',
        },
        compatibility,
      }),
    ).toEqual({
      providerAuthentication: { type: 'direct' },
      env: {
        AI_SDK_ACP_CLIENT_APP_NAME: clientApp.name,
        AI_SDK_ACP_CLIENT_APP_VERSION: clientApp.version,
      },
    });
  });
});

describe('createACPAuthenticationProfileIdentity', () => {
  it('persists only named selection facts and a digest', () => {
    const compatibility = resolveACPProviderAuthenticationCompatibility({
      auth: 'ai-gateway',
      providerAuthentication: {
        gateway: {
          env: {
            ...gatewayEnv,
            AUTHENTICATED_HEADER: 'authenticated-header-secret',
          },
        },
      },
      env: {
        VERCEL_OIDC_TOKEN: 'resolved-oidc-secret',
      },
    });
    const identity = createACPAuthenticationProfileIdentity({
      authentication: {
        methodId: 'api-key',
        meta: { token: 'acp-authentication-secret' },
        clientCapabilities: {
          headers: { Authorization: 'client-capability-secret' },
        },
      },
      providerAuthenticationCompatibility: compatibility,
    });
    const serialized = JSON.stringify(identity);

    expect(identity).toMatchObject({
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      acpMethodId: 'api-key',
      providerKind: 'ai-gateway',
      providerMode: 'ai-gateway',
      gatewayCredentialSource: 'VERCEL_OIDC_TOKEN',
    });
    expect(serialized).not.toContain('resolved-oidc-secret');
    expect(serialized).not.toContain('authenticated-header-secret');
    expect(serialized).not.toContain('acp-authentication-secret');
    expect(serialized).not.toContain('client-capability-secret');
    expect(serialized).not.toContain('Authorization');
  });

  it('keeps its digest stable across secret rotation at the same source', () => {
    const firstCompatibility = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: { gateway: { env: gatewayEnv } },
      env: { AI_GATEWAY_API_KEY: 'first-secret' },
    });
    const rotatedCompatibility = resolveACPProviderAuthenticationCompatibility({
      providerAuthentication: { gateway: { env: gatewayEnv } },
      env: { AI_GATEWAY_API_KEY: 'rotated-secret' },
    });

    expect(
      createACPAuthenticationProfileIdentity({
        authentication: { methodId: 'api-key' },
        providerAuthenticationCompatibility: firstCompatibility,
      }),
    ).toEqual(
      createACPAuthenticationProfileIdentity({
        authentication: { methodId: 'api-key' },
        providerAuthenticationCompatibility: rotatedCompatibility,
      }),
    );
  });
});
