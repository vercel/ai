import { describe, expect, it } from 'vitest';
import {
  resolveACPAgentEnvironment,
  validateACPV1Settings,
  type ACPV1Settings,
} from './acp-v1-settings';

const baseSettings = {
  harnessId: 'example-acp',
  source: {
    type: 'npm-locked',
    packageJson: '{"dependencies":{"@example/acp-agent":"1.2.3"}}\n',
    pnpmLockYaml: "lockfileVersion: '9.0'\n",
  },
  executable: 'acp-agent',
  forwardEnv: ['PROVIDER_API_KEY', 'SECOND_PROVIDER_API_KEY'],
  env: { PROVIDER_BASE_URL: 'https://provider.example' },
  modelMapping: { type: 'session-config-option', path: 'model' },
  isMcpToolCall: () => false,
  resolveHostToolCall: () => undefined,
} as const satisfies ACPV1Settings;

function validate(settings: Partial<ACPV1Settings>): () => void {
  return () =>
    validateACPV1Settings({ settings: { ...baseSettings, ...settings } });
}

describe('validateACPV1Settings', () => {
  it('accepts locked and install command sources', () => {
    expect(validate({})).not.toThrow();
    expect(
      validate({
        source: {
          type: 'install-command',
          command: 'curl https://example.com/install -fsS | bash',
        },
      }),
    ).not.toThrow();
  });

  it('requires credential environment and brokering together', () => {
    expect(validate({ credentialEnv: ['THIRD_API_KEY'] })).toThrow(
      'credentialEnv and credentialBrokering must be configured together',
    );
    expect(validate({ credentialBrokering: () => [] })).toThrow(
      'credentialEnv and credentialBrokering must be configured together',
    );
  });

  it('reserves the harness tools MCP server name', () => {
    expect(validate({ mcpServers: { 'ai-sdk-harness-tools': {} } })).toThrow(
      'is reserved for HarnessAgent tools',
    );
  });

  it('requires a kebab-case harness id', () => {
    expect(validate({ harnessId: 'Example ACP' })).toThrow(
      'stable kebab-case identifier',
    );
  });

  it('requires tool call classification and host tool resolution callbacks', () => {
    expect(
      validate({
        isMcpToolCall: undefined as unknown as ACPV1Settings['isMcpToolCall'],
      }),
    ).toThrow('ACP isMcpToolCall must be a function.');
    expect(
      validate({
        resolveHostToolCall:
          undefined as unknown as ACPV1Settings['resolveHostToolCall'],
      }),
    ).toThrow('ACP resolveHostToolCall must be a function.');
  });

  it('rejects empty locked artifacts and install commands', () => {
    expect(
      validate({ source: { ...baseSettings.source, packageJson: '' } }),
    ).toThrow('source.packageJson must not be empty');
    expect(
      validate({ source: { ...baseSettings.source, pnpmLockYaml: '' } }),
    ).toThrow('source.pnpmLockYaml must not be empty');
    expect(
      validate({ source: { ...baseSettings.source, pnpmWorkspaceYaml: '' } }),
    ).toThrow('source.pnpmWorkspaceYaml must not be empty');
    expect(
      validate({ source: { type: 'install-command', command: '  \n' } }),
    ).toThrow('source.command must not be empty');
  });

  it('requires a bare executable name', () => {
    expect(validate({ executable: 'bin/acp-agent' })).toThrow(
      'bare command name without a path',
    );
  });

  it('rejects invalid environment-variable names and values', () => {
    expect(validate({ forwardEnv: ['not-an-environment-variable'] })).toThrow(
      'environment variable name is invalid',
    );
    expect(
      validate({
        credentialEnv: ['not-an-environment-variable'],
        credentialBrokering: () => [],
      }),
    ).toThrow('environment variable name is invalid');
    expect(
      validate({ env: { 'not-an-environment-variable': 'value' } }),
    ).toThrow('environment variable name is invalid');
    expect(validate({ env: { PROVIDER_BASE_URL: 'a\0b' } })).toThrow(
      'contains NUL',
    );
  });

  it('requires every environment key to be configured once', () => {
    expect(validate({ env: { PROVIDER_API_KEY: 'not-secret' } })).toThrow(
      'cannot be configured in both forwardEnv and env',
    );
    expect(
      validate({
        credentialEnv: ['PROVIDER_API_KEY'],
        credentialBrokering: () => [],
      }),
    ).toThrow('cannot be configured in both forwardEnv and credentialEnv');
    expect(
      validate({
        credentialEnv: ['PROVIDER_BASE_URL'],
        credentialBrokering: () => [],
      }),
    ).toThrow('cannot be configured in both credentialEnv and env');
  });
});

describe('resolveACPAgentEnvironment', () => {
  it('forwards only configured non-empty values and literal values', () => {
    expect(
      resolveACPAgentEnvironment({
        settings: baseSettings,
        env: {
          PROVIDER_API_KEY: 'provider-secret',
          SECOND_PROVIDER_API_KEY: '',
          UNRELATED_SECRET: 'unrelated-secret',
        },
        credentialEnv: {},
      }),
    ).toEqual({
      PROVIDER_API_KEY: 'provider-secret',
      PROVIDER_BASE_URL: 'https://provider.example',
    });
  });

  it('reads credential environment keys from the credential environment', () => {
    expect(
      resolveACPAgentEnvironment({
        settings: {
          ...baseSettings,
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
});
