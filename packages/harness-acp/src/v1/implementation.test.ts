import { describe, expect, it } from 'vitest';
import type {
  ACPClientApp,
  ACPProviderAuthenticationCompatibility,
} from '../acp-auth';
import type {
  ACPModelMapping,
  ACPPermissionModeMapping,
  ACPSerializableValue,
} from './acp-v1-settings';
import {
  type ACPImplementation,
  createImplementationDescriptor,
  createImplementationIdentity,
  createImplementationInstallCommand,
  createImplementationManifest,
  getImplementationInstallScript,
  getImplementationLockfile,
  resolveImplementationEnvironment,
  validateACPV1Implementation,
} from './implementation';

const simpleImplementation = {
  source: {
    type: 'npm-simple',
    packageName: '@example/acp-agent',
    packageVersion: '1.2.3',
  },
  executable: 'acp-agent',
  args: ['stdio'],
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
  env: {
    PROVIDER_BASE_URL: 'https://provider.example',
  },
} as const satisfies ACPImplementation;

const unpinnedImplementation = {
  source: {
    type: 'npm-simple',
    packageName: '@example/acp-agent',
  },
  executable: 'acp-agent',
  args: ['stdio'],
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
  env: {
    PROVIDER_BASE_URL: 'https://provider.example',
  },
} as const satisfies ACPImplementation;

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
  source: {
    type: 'npm-locked',
    packageJson,
    pnpmLockYaml,
  },
  executable: 'acp-agent',
  args: ['stdio'],
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
  env: {
    PROVIDER_BASE_URL: 'https://provider.example',
  },
} as const satisfies ACPImplementation;

const installCommandImplementation = {
  source: {
    type: 'install-command',
    command: 'curl https://example.com/install -fsS | bash',
  },
  executable: 'acp-agent',
  args: ['stdio'],
  credentialEnv: ['PROVIDER_API_KEY'],
} as const satisfies ACPImplementation;

const clientApp = {
  name: 'ai-sdk/harness-acp',
  version: '0.0.0-test',
} as const satisfies ACPClientApp;

function identity({
  implementation = simpleImplementation,
  harnessId = 'example-acp',
  clientApp: clientAppOverride = clientApp,
  clientCapabilities,
  modelMapping = {
    type: 'session-config-option',
    path: 'model',
  },
  providerAuthentication,
  permissionModeMapping,
}: {
  implementation?: ACPImplementation;
  harnessId?: string;
  clientApp?: ACPClientApp;
  clientCapabilities?: Readonly<Record<string, ACPSerializableValue>>;
  modelMapping?: ACPModelMapping;
  providerAuthentication?: ACPProviderAuthenticationCompatibility;
  permissionModeMapping?: ACPPermissionModeMapping;
} = {}): string {
  return createImplementationIdentity({
    harnessId,
    acpVersion: 'v1',
    implementation,
    clientApp: clientAppOverride,
    clientCapabilities,
    modelMapping,
    providerAuthentication,
    permissionModeMapping,
  });
}

describe('ACP implementation', () => {
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

  it('installs the latest dist-tag when no version is pinned', () => {
    expect(
      createImplementationManifest({
        implementation: unpinnedImplementation,
      }),
    ).toBe(`{
  "name": "harness-acp-implementation",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@example/acp-agent": "latest"
  }
}
`);
    expect(() =>
      validateACPV1Implementation(unpinnedImplementation),
    ).not.toThrow();
  });

  it('keeps the identity of an unpinned source free of any version', () => {
    const unpinnedIdentity = identity({
      implementation: unpinnedImplementation,
    });

    expect(identity({ implementation: unpinnedImplementation })).toBe(
      unpinnedIdentity,
    );
    expect(identity({ implementation: simpleImplementation })).not.toBe(
      unpinnedIdentity,
    );
    expect(
      identity({
        implementation: {
          ...unpinnedImplementation,
          source: {
            ...unpinnedImplementation.source,
            packageName: '@example/other-agent',
          },
        },
      }),
    ).not.toBe(unpinnedIdentity);
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

  it('creates an isolated bash installation for an install command source', () => {
    expect(
      createImplementationManifest({
        implementation: installCommandImplementation,
      }),
    ).toBeUndefined();
    expect(
      getImplementationLockfile({
        implementation: installCommandImplementation,
      }),
    ).toBeUndefined();
    expect(
      createImplementationInstallCommand({
        implementationDir: '/tmp/harness/example/implementation',
        storeDir: '/tmp/harness/example/.pnpm-store',
        implementation: installCommandImplementation,
      }),
    ).toBe('bash implementation/install.sh');

    const script = getImplementationInstallScript({
      implementation: installCommandImplementation,
    });
    expect(script).toContain('set -euo pipefail');
    expect(script).toContain('ACP_INSTALL_HOME="$ACP_IMPLEMENTATION_DIR/home"');
    expect(script).toContain(
      'export PATH="$ACP_INSTALL_HOME/.local/bin:$PATH"',
    );
    expect(script).toContain('curl https://example.com/install -fsS | bash');
  });

  it('rejects an empty install command', () => {
    expect(() =>
      validateACPV1Implementation({
        ...installCommandImplementation,
        source: { type: 'install-command', command: '  \n' },
      }),
    ).toThrow('source.command must not be empty');
  });

  it('requires exact versions only for a simple npm source', () => {
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        source: {
          ...simpleImplementation.source,
          packageVersion: '^1.2.3',
        },
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

  it('requires credential environment keys to be distinct from other environment settings', () => {
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        credentialEnv: ['PROVIDER_API_KEY'],
      }),
    ).toThrow('cannot be configured in both forwardEnv and credentialEnv');
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        credentialEnv: ['PROVIDER_BASE_URL'],
      }),
    ).toThrow('cannot be configured in both credentialEnv and env');
  });

  it('rejects invalid forwarded environment-variable names', () => {
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        forwardEnv: ['not-an-environment-variable'],
      }),
    ).toThrow('environment variable name is invalid');
    expect(() =>
      validateACPV1Implementation({
        ...simpleImplementation,
        credentialEnv: ['not-an-environment-variable'],
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
    expect(
      resolveImplementationEnvironment({
        implementation: {
          ...simpleImplementation,
          forwardEnv: ['SECOND_PROVIDER_API_KEY'],
          credentialEnv: ['PROVIDER_API_KEY'],
        },
        env: {
          PROVIDER_API_KEY: 'provider-secret',
          SECOND_PROVIDER_API_KEY: 'second-provider-secret',
        },
      }),
    ).toEqual({
      PROVIDER_API_KEY: 'provider-secret',
      SECOND_PROVIDER_API_KEY: 'second-provider-secret',
      PROVIDER_BASE_URL: 'https://provider.example',
    });
    expect(
      resolveImplementationEnvironment({
        implementation: {
          ...simpleImplementation,
          forwardEnv: ['SECOND_PROVIDER_API_KEY'],
          credentialEnv: ['PROVIDER_API_KEY'],
        },
        env: {
          PROVIDER_API_KEY: 'ambient-provider-secret',
          SECOND_PROVIDER_API_KEY: 'forwarded-value',
        },
        credentialEnv: {
          PROVIDER_API_KEY: 'programmatic-provider-secret',
        },
      }),
    ).toEqual({
      PROVIDER_API_KEY: 'programmatic-provider-secret',
      SECOND_PROVIDER_API_KEY: 'forwarded-value',
      PROVIDER_BASE_URL: 'https://provider.example',
    });
  });

  it('keeps sensitive values out of immutable descriptors', () => {
    const descriptor = createImplementationDescriptor({
      implementation: simpleImplementation,
    });

    expect(descriptor).toContain('"PROVIDER_API_KEY"');
    expect(descriptor).toContain('"SECOND_PROVIDER_API_KEY"');
    expect(descriptor).toContain('"PROVIDER_BASE_URL"');
    expect(descriptor).not.toContain('"implementationIdentity"');
    expect(descriptor).not.toContain('https://provider.example');
  });

  it('uses source-specific paths in a common launch descriptor', () => {
    expect(
      createImplementationDescriptor({ implementation: simpleImplementation }),
    ).toContain('"executablePath": "node_modules/.bin/acp-agent"');
    expect(
      createImplementationDescriptor({
        implementation: installCommandImplementation,
      }),
    ).toContain('"executablePath": "home/.local/bin/acp-agent"');
    expect(
      createImplementationDescriptor({
        implementation: installCommandImplementation,
      }),
    ).toContain('"privateHome": true');
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
          forwardEnv: ['SECOND_PROVIDER_API_KEY'],
          credentialEnv: ['PROVIDER_API_KEY'],
        },
      }),
    ).not.toBe(baseIdentity);
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
    expect(identity({ implementation: installCommandImplementation })).not.toBe(
      baseIdentity,
    );
    expect(
      identity({
        implementation: {
          ...installCommandImplementation,
          source: {
            type: 'install-command',
            command: 'curl https://example.com/other -fsS | bash',
          },
        },
      }),
    ).not.toBe(identity({ implementation: installCommandImplementation }));
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          source: {
            ...simpleImplementation.source,
            packageName: '@example/other-agent',
          },
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        implementation: {
          ...simpleImplementation,
          source: {
            ...simpleImplementation.source,
            packageVersion: '1.2.4',
          },
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
        clientCapabilities: {
          _meta: { parameterizedModelPicker: true },
        },
      }),
    ).not.toBe(baseIdentity);
    expect(
      identity({
        modelMapping: {
          type: 'session-model',
          path: 'modelId',
        },
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

  it('identifies every locked acquisition artifact independently', () => {
    const lockedIdentity = identity({
      implementation: lockedImplementation,
    });

    expect(
      identity({
        implementation: {
          ...lockedImplementation,
          source: {
            ...lockedImplementation.source,
            packageJson: packageJson.replace('locked-acp-agent', 'other-agent'),
          },
        },
      }),
    ).not.toBe(lockedIdentity);
    expect(
      identity({
        implementation: {
          ...lockedImplementation,
          source: {
            ...lockedImplementation.source,
            pnpmLockYaml: `${pnpmLockYaml}\n# changed\n`,
          },
        },
      }),
    ).not.toBe(lockedIdentity);
    expect(
      identity({
        implementation: {
          ...lockedImplementation,
          source: {
            ...lockedImplementation.source,
            pnpmWorkspaceYaml:
              "allowBuilds:\n  '@example/acp-agent@1.2.3': true\n",
          },
        },
      }),
    ).not.toBe(lockedIdentity);
  });

  it('identifies non-secret provider routing without credential values', () => {
    const environmentGateway = {
      type: 'ai-gateway',
      mode: 'ai-gateway',
      env: {
        PROVIDER_API_KEY: { $source: 'gateway-api-key' },
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
