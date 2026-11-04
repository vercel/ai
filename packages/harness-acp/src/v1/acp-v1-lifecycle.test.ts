import { describe, expect, it } from 'vitest';
import type { ACPProviderAuthenticationCompatibility } from '../acp-auth';
import {
  createACPAgentIdentity,
  resolveACPInitialGuidanceApplied,
  validateACPLifecycleCompatibility,
} from './acp-v1-lifecycle';
import type { ACPV1Settings } from './acp-v1-settings';

const lockedSource = {
  type: 'npm-locked',
  packageJson: '{"dependencies":{"@example/acp-agent":"1.2.3"}}\n',
  pnpmLockYaml: "lockfileVersion: '9.0'\n",
} as const;

const baseSettings = {
  harnessId: 'example-acp',
  source: lockedSource,
  executable: 'acp-agent',
  args: ['stdio'],
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
  env: { PROVIDER_BASE_URL: 'https://provider.example' },
  modelMapping: { type: 'session-config-option', path: 'model' },
  isMcpToolCall: () => false,
  resolveHostToolCall: () => undefined,
} as const satisfies ACPV1Settings;

function identity({
  settings = {},
  clientApp = { name: 'ai-sdk-harness-acp', version: '0.0.0-test' },
  providerAuthentication,
}: {
  settings?: Partial<ACPV1Settings>;
  clientApp?: { name: string; version: string };
  providerAuthentication?: ACPProviderAuthenticationCompatibility;
} = {}): string {
  return createACPAgentIdentity({
    settings: { ...baseSettings, ...settings },
    clientApp,
    providerAuthentication,
  });
}

describe('createACPAgentIdentity', () => {
  it('ignores the order and duplication of environment key lists', () => {
    expect(
      identity({
        settings: {
          forwardEnv: [
            'SECOND_PROVIDER_API_KEY',
            'PROVIDER_API_KEY',
            'PROVIDER_API_KEY',
          ],
        },
      }),
    ).toBe(identity());
    expect(identity({ settings: { nonTextContentTypes: [] } })).toBe(
      identity(),
    );
    expect(identity({ settings: { nonTextContentTypes: ['image'] } })).toBe(
      identity({ settings: { nonTextContentTypes: ['image', 'image'] } }),
    );
  });

  it('identifies every non-secret acquisition and launch input', () => {
    const baseIdentity = identity();
    const variants: ReadonlyArray<Parameters<typeof identity>[0]> = [
      { settings: { harnessId: 'other-acp' } },
      {
        settings: {
          source: {
            type: 'install-command',
            command: 'curl https://example.com/install -fsS | bash',
          },
        },
      },
      { settings: { executable: 'other-agent' } },
      { settings: { args: ['other'] } },
      { settings: { forwardEnv: ['OTHER_PROVIDER_API_KEY'] } },
      {
        settings: {
          forwardEnv: ['SECOND_PROVIDER_API_KEY'],
          credentialEnv: ['PROVIDER_API_KEY'],
        },
      },
      { settings: { env: { PROVIDER_BASE_URL: 'https://other.example' } } },
      {
        settings: {
          clientCapabilities: { _meta: { parameterizedModelPicker: true } },
        },
      },
      {
        settings: { modelMapping: { type: 'session-model', path: 'modelId' } },
      },
      {
        settings: {
          permissionModeMapping: {
            'allow-reads': { type: 'session-mode', modeId: 'read-only' },
            'allow-edits': { type: 'session-mode', modeId: 'agent' },
            'allow-all': { type: 'session-mode', modeId: 'full-access' },
          },
        },
      },
      { settings: { nonTextContentTypes: ['image'] } },
      { clientApp: { name: 'custom-client', version: '4.5.6' } },
    ];

    for (const variant of variants) {
      expect(identity(variant)).not.toBe(baseIdentity);
    }
  });

  it('identifies every locked acquisition artifact independently', () => {
    const baseIdentity = identity();

    for (const source of [
      { ...lockedSource, packageJson: '{"dependencies":{}}\n' },
      { ...lockedSource, pnpmLockYaml: "lockfileVersion: '9.0'\n# changed\n" },
      {
        ...lockedSource,
        pnpmWorkspaceYaml: "allowBuilds:\n  '@example/acp-agent': true\n",
      },
    ]) {
      expect(identity({ settings: { source } })).not.toBe(baseIdentity);
    }
  });

  it('identifies non-secret provider routing without credential values', () => {
    const gateway = {
      type: 'ai-gateway',
      mode: 'ai-gateway',
      env: { PROVIDER_API_KEY: { $source: 'gateway-api-key' } },
      credentialSource: 'AI_GATEWAY_API_KEY',
      baseUrl: 'https://gateway.example',
    } as const satisfies ACPProviderAuthenticationCompatibility;
    const gatewayIdentity = identity({ providerAuthentication: gateway });

    expect(gatewayIdentity).not.toBe(identity());
    expect(
      identity({
        providerAuthentication: {
          ...gateway,
          credentialSource: 'VERCEL_OIDC_TOKEN',
        },
      }),
    ).not.toBe(gatewayIdentity);
    expect(
      identity({
        providerAuthentication: {
          ...gateway,
          baseUrl: 'https://other-gateway.example',
        },
      }),
    ).not.toBe(gatewayIdentity);
  });
});

describe('ACP prompt guidance lifecycle', () => {
  it('applies guidance to a fresh session', () => {
    expect(
      resolveACPInitialGuidanceApplied({
        isResume: false,
        lifecycleState: { initialGuidanceApplied: true },
      }),
    ).toBe(false);
  });

  it('does not reannounce guidance when a legacy resume state lacks the flag', () => {
    expect(
      resolveACPInitialGuidanceApplied({
        isResume: true,
        lifecycleState: undefined,
      }),
    ).toBe(true);
  });

  it('preserves an explicit resume guidance flag', () => {
    expect(
      resolveACPInitialGuidanceApplied({
        isResume: true,
        lifecycleState: { initialGuidanceApplied: false },
      }),
    ).toBe(false);
  });
});

describe('validateACPLifecycleCompatibility', () => {
  const authenticationProfile = {
    digest: 'authentication-profile',
    providerKind: 'direct',
    providerMode: 'direct',
  } as const;
  const lifecycleData = {
    agentIdentity: 'agent',
    authenticationProfile,
    bridge: {
      port: 4319,
      token: 'bridge-token',
      lastSeenEventId: 7,
      sandboxId: 'sandbox-1',
    },
  } as const;

  it('accepts matching harness, agent, auth, and sandbox identities', () => {
    expect(() =>
      validateACPLifecycleCompatibility({
        harnessId: 'portable-acp',
        lifecycleHarnessId: 'portable-acp',
        agentIdentity: 'agent',
        authenticationProfile,
        lifecycleData,
        sandboxId: 'sandbox-1',
      }),
    ).not.toThrow();
  });

  it.each([
    {
      name: 'harness',
      options: { lifecycleHarnessId: 'other-acp' },
      error: 'produced by harness',
    },
    {
      name: 'agent',
      options: { agentIdentity: 'other-agent' },
      error: 'configured agent',
    },
    {
      name: 'authentication profile',
      options: {
        authenticationProfile: {
          ...authenticationProfile,
          digest: 'other-authentication',
        },
      },
      error: 'authentication profile',
    },
    {
      name: 'sandbox',
      options: { sandboxId: 'sandbox-2' },
      error: 'belongs to sandbox',
    },
  ])('rejects a mismatched $name before attach', ({ options, error }) => {
    expect(() =>
      validateACPLifecycleCompatibility({
        harnessId: 'portable-acp',
        lifecycleHarnessId: 'portable-acp',
        agentIdentity: 'agent',
        authenticationProfile,
        lifecycleData,
        sandboxId: 'sandbox-1',
        ...options,
      }),
    ).toThrow(error);
  });
});
