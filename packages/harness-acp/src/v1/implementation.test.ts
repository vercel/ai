import { describe, expect, it } from 'vitest';
import type {
  ACPClientApp,
  ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
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
  validateACPV1Implementation,
} from './implementation';

const simpleImplementation = {
  type: 'npm',
  mode: 'simple',
  packageName: '@example/acp-agent',
  version: '1.2.3',
  executable: 'acp-agent',
  args: ['stdio'],
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
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
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
  env: {
    PROVIDER_BASE_URL: 'https://provider.example',
  },
} as const satisfies ACPNpmImplementation;

const clientApp = {
  name: 'ai-sdk/harness-acp',
  version: '0.0.0-test',
} as const satisfies ACPClientApp;

function identity({
  implementation = simpleImplementation,
  harnessId = 'example-acp',
  clientApp: clientAppOverride = clientApp,
  providerAuthentication,
  permissionModeMapping,
}: {
  implementation?: ACPNpmImplementation;
  harnessId?: string;
  clientApp?: ACPClientApp;
  providerAuthentication?: ACPProviderAuthenticationCompatibility;
  permissionModeMapping?: ACPPermissionModeMapping;
} = {}): string {
  return createImplementationIdentity({
    harnessId,
    acpVersion: 'v1',
    implementation,
    clientApp: clientAppOverride,
    providerAuthentication,
    permissionModeMapping,
  });
}

describe('ACP npm implementation', () => {
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
      validateACPV1Implementation({
        ...simpleImplementation,
        version: '^1.2.3',
      }),
    ).toThrow('must be an exact semantic version');
    expect(() =>
      validateACPV1Implementation(lockedImplementation),
    ).not.toThrow();
  });

  it('rejects overlapping sensitive and non-secret environment keys', () => {
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        env: {
          PROVIDER_API_KEY: 'not-secret',
        },
      }),
    ).toThrow('cannot be configured in both forwardEnv and env');
  });

  it('rejects invalid forwarded environment-variable names', () => {
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        forwardEnv: ['not-an-environment-variable'],
      }),
    ).toThrow('environment variable name is invalid');
  });

  it('rejects invalid literal environment-variable names', () => {
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        env: {
          'not-an-environment-variable': 'value',
        },
      }),
    ).toThrow('environment variable name is invalid');
  });

  it('forwards configured environment variables only for runtime launch', () => {
    expect(
      resolveImplementationEnvironment({
        implementation: simpleImplementation,
        env: {
          PROVIDER_API_KEY: 'provider-secret',
          SECOND_PROVIDER_API_KEY: 'second-provider-secret',
          UNRELATED_SECRET: 'unrelated-secret',
        },
      }),
    ).toEqual({
      PROVIDER_API_KEY: 'provider-secret',
      SECOND_PROVIDER_API_KEY: 'second-provider-secret',
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
          SECOND_PROVIDER_API_KEY: 'second-provider-secret',
        },
      }),
    ).toEqual({
      SECOND_PROVIDER_API_KEY: 'second-provider-secret',
      PROVIDER_BASE_URL: 'https://provider.example',
    });
  });

  it('keeps sensitive values out of immutable descriptors', () => {
    const descriptor = createImplementationDescriptor({
      implementation: simpleImplementation,
      implementationIdentity: identity(),
    });

    expect(descriptor).toContain('"PROVIDER_API_KEY"');
    expect(descriptor).toContain('"SECOND_PROVIDER_API_KEY"');
    expect(descriptor).toContain('"PROVIDER_BASE_URL"');
    expect(descriptor).toContain('"implementationIdentity"');
    expect(descriptor).not.toContain('https://provider.example');
  });

  it('identifies every non-secret acquisition and launch input', () => {
    const baseIdentity = identity();

    expect(identity()).toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          forwardEnv: ['SECOND_PROVIDER_API_KEY', 'PROVIDER_API_KEY'],
        },
      }),
    ).toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          forwardEnv: ['OTHER_PROVIDER_API_KEY'],
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
          forwardEnv: [
            'PROVIDER_API_KEY',
            'SECOND_PROVIDER_API_KEY',
            'THIRD_SECRET',
          ],
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
        clientApp: { name: 'custom-client', version: '4.5.6' },
      }),
    ).not.toBe(baseIdentity);
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
