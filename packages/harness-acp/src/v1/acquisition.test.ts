import { describe, expect, it } from 'vitest';
import type { ACPProviderAuthenticationCompatibility } from '../acp-auth';
import type {
  ACPNpmImplementation,
  ACPPermissionModeMapping,
} from './acp-v1-settings';
import {
  createImplementationDescriptor,
  createImplementationIdentity,
  createImplementationInstallCommand,
  createImplementationManifest,
  getImplementationLockfile,
  resolveImplementationEnvironment,
  validateACPV1Settings,
} from './acquisition';

const simpleImplementation = {
  type: 'npm',
  packageName: '@example/acp-agent',
  version: '1.2.3',
  executable: 'acp-agent',
  args: ['stdio'],
  envSources: {
    PROVIDER_API_KEY: ['PRIMARY_PROVIDER_API_KEY', 'FALLBACK_PROVIDER_API_KEY'],
  },
  env: {
    PROVIDER_BASE_URL: 'https://provider.example',
  },
} as const satisfies ACPNpmImplementation;

const packageJson = `{
  "name": "locked-acp-agent",
  "private": true,
  "dependencies": {
    "@example/acp-agent": "1.2.3"
  }
}
`;
const pnpmLockYaml = `lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@example/acp-agent':
        specifier: 1.2.3
        version: 1.2.3
`;

const lockedImplementation = {
  type: 'npm',
  mode: 'locked',
  packageJson,
  pnpmLockYaml,
  executable: 'acp-agent',
  args: ['stdio'],
  envSources: {
    PROVIDER_API_KEY: ['PRIMARY_PROVIDER_API_KEY', 'FALLBACK_PROVIDER_API_KEY'],
  },
  env: {
    PROVIDER_BASE_URL: 'https://provider.example',
  },
} as const satisfies ACPNpmImplementation;

function identity({
  implementation = simpleImplementation,
  harnessId = 'example-acp',
  providerAuthentication,
  permissionModeMapping,
}: {
  implementation?: ACPNpmImplementation;
  harnessId?: string;
  providerAuthentication?: ACPProviderAuthenticationCompatibility;
  permissionModeMapping?: ACPPermissionModeMapping;
} = {}): string {
  return createImplementationIdentity({
    harnessId,
    acpVersion: 'v1',
    implementation,
    providerAuthentication,
    permissionModeMapping,
  });
}

describe('ACP npm acquisition', () => {
  it('creates a manifest for a simple exact-version installation', () => {
    expect(
      createImplementationManifest({
        implementation: simpleImplementation,
      }),
    ).toBe(`{
  "name": "harness-acp-implementation",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@example/acp-agent": "1.2.3"
  }
}
`);
    expect(
      createImplementationInstallCommand({
        implementationDir: '/tmp/harness/example/implementation',
        storeDir: '/tmp/harness/example/.pnpm-store',
        implementation: simpleImplementation,
      }),
    ).toBe(
      'pnpm --dir /tmp/harness/example/implementation install --prod --store-dir /tmp/harness/example/.pnpm-store',
    );
    expect(
      getImplementationLockfile({
        implementation: simpleImplementation,
      }),
    ).toBeUndefined();
  });

  it('preserves caller-provided locked artifacts and freezes installation', () => {
    expect(
      createImplementationManifest({
        implementation: lockedImplementation,
      }),
    ).toBe(packageJson);
    expect(
      getImplementationLockfile({
        implementation: lockedImplementation,
      }),
    ).toBe(pnpmLockYaml);
    expect(
      createImplementationInstallCommand({
        implementationDir: '/tmp/harness/example/implementation',
        storeDir: '/tmp/harness/example/.pnpm-store',
        implementation: lockedImplementation,
      }),
    ).toBe(
      'pnpm --dir /tmp/harness/example/implementation install --frozen-lockfile --prod --store-dir /tmp/harness/example/.pnpm-store',
    );
  });

  it('requires exact versions only for simple acquisition', () => {
    expect(() =>
      validateACPV1Settings({
        harnessId: 'example-acp',
        implementation: {
          ...simpleImplementation,
          version: '^1.2.3',
        },
      }),
    ).toThrow('must be an exact semantic version');
    expect(() =>
      validateACPV1Settings({
        harnessId: 'example-acp',
        implementation: lockedImplementation,
      }),
    ).not.toThrow();
  });

  it('rejects overlapping sensitive and non-secret environment keys', () => {
    expect(() =>
      validateACPV1Settings({
        harnessId: 'example-acp',
        implementation: {
          ...simpleImplementation,
          env: {
            PROVIDER_API_KEY: 'not-secret',
          },
        },
      }),
    ).toThrow('cannot be configured in both envSources and env');
  });

  it('rejects invalid or empty environment-variable source names', () => {
    expect(() =>
      validateACPV1Settings({
        harnessId: 'example-acp',
        implementation: {
          ...simpleImplementation,
          envSources: {
            PROVIDER_API_KEY: 'not-an-environment-variable',
          },
        },
      }),
    ).toThrow('environment source name is invalid');
    expect(() =>
      validateACPV1Settings({
        harnessId: 'example-acp',
        implementation: {
          ...simpleImplementation,
          envSources: {
            PROVIDER_API_KEY: [],
          },
        },
      }),
    ).toThrow('must configure at least one source environment variable');
  });

  it('resolves the first available sensitive source only for runtime launch', () => {
    expect(
      resolveImplementationEnvironment({
        implementation: simpleImplementation,
        env: {
          PRIMARY_PROVIDER_API_KEY: 'primary-secret',
          FALLBACK_PROVIDER_API_KEY: 'fallback-secret',
        },
      }),
    ).toEqual({
      PROVIDER_API_KEY: 'primary-secret',
      PROVIDER_BASE_URL: 'https://provider.example',
    });
    expect(
      resolveImplementationEnvironment({
        implementation: simpleImplementation,
        env: {},
      }),
    ).toEqual({
      PROVIDER_BASE_URL: 'https://provider.example',
    });
    expect(
      resolveImplementationEnvironment({
        implementation: simpleImplementation,
        env: {
          FALLBACK_PROVIDER_API_KEY: 'fallback-secret',
        },
      }),
    ).toEqual({
      PROVIDER_API_KEY: 'fallback-secret',
      PROVIDER_BASE_URL: 'https://provider.example',
    });
  });

  it('keeps sensitive values out of immutable descriptors', () => {
    const descriptor = createImplementationDescriptor({
      implementation: simpleImplementation,
      implementationIdentity: identity(),
    });

    expect(descriptor).toContain('"PROVIDER_API_KEY"');
    expect(descriptor).toContain('"PROVIDER_BASE_URL"');
    expect(descriptor).toContain('"implementationIdentity"');
    expect(descriptor).not.toContain('PRIMARY_PROVIDER_API_KEY');
    expect(descriptor).not.toContain('https://provider.example');
  });

  it('identifies every non-secret acquisition and launch input', () => {
    const baseIdentity = identity();

    expect(identity()).toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          envSources: {
            PROVIDER_API_KEY: [
              'PRIMARY_PROVIDER_API_KEY',
              'FALLBACK_PROVIDER_API_KEY',
            ],
          },
        },
      }),
    ).toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          envSources: {
            PROVIDER_API_KEY: 'OTHER_PROVIDER_API_KEY',
          },
        },
      }),
    ).not.toBe(baseIdentity);
    expect(identity({ implementation: lockedImplementation })).not.toBe(
      baseIdentity,
    );
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          packageName: '@example/other-agent',
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          version: '1.2.4',
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          executable: 'other-agent',
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          args: ['other'],
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          envSources: {
            PROVIDER_API_KEY: [
              'PRIMARY_PROVIDER_API_KEY',
              'FALLBACK_PROVIDER_API_KEY',
            ],
            SECOND_SECRET: 'SECOND_SECRET',
          },
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          env: {
            PROVIDER_BASE_URL: 'https://other.example',
          },
        },
      }),
    ).not.toBe(baseIdentity);
    expect(identity({ harnessId: 'other-acp' })).not.toBe(baseIdentity);
    expect(
      identity({
        permissionModeMapping: {
          'allow-reads': { type: 'session-mode', modeId: 'read-only' },
          'allow-edits': { type: 'session-mode', modeId: 'agent' },
          'allow-all': { type: 'session-mode', modeId: 'full-access' },
        },
      }),
    ).not.toBe(baseIdentity);
  });

  it('identifies locked manifest and lockfile content independently', () => {
    const lockedIdentity = identity({
      implementation: lockedImplementation,
    });

    expect(
      identity({
        implementation: {
          ...lockedImplementation,
          packageJson: packageJson.replace('locked-acp-agent', 'other-agent'),
        },
      }),
    ).not.toBe(lockedIdentity);
    expect(
      identity({
        implementation: {
          ...lockedImplementation,
          pnpmLockYaml: `${pnpmLockYaml}\n# changed\n`,
        },
      }),
    ).not.toBe(lockedIdentity);
  });

  it('identifies non-secret provider routing without credential values', () => {
    const environmentGateway = {
      type: 'ai-gateway',
      mode: 'ai-gateway',
      route: {
        type: 'launch',
        env: {
          PROVIDER_API_KEY: { $source: 'gateway-api-key' },
        },
      },
      credentialSource: 'AI_GATEWAY_API_KEY',
      baseUrl: 'https://gateway.example',
    } as const satisfies ACPProviderAuthenticationCompatibility;
    const gatewayIdentity = identity({
      providerAuthentication: environmentGateway,
    });

    expect(
      identity({
        providerAuthentication: {
          ...environmentGateway,
          credentialSource: 'VERCEL_OIDC_TOKEN',
        },
      }),
    ).not.toBe(gatewayIdentity);
    expect(
      identity({
        providerAuthentication: {
          ...environmentGateway,
          baseUrl: 'https://other-gateway.example',
        },
      }),
    ).not.toBe(gatewayIdentity);
  });
});
