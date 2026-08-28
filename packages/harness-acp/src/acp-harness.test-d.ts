import { commonTool } from '@ai-sdk/harness';
import type { ToolCall } from '@agentclientprotocol/sdk';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';
import { createACP, type ACPHarnessSettings } from './acp-harness';
import type { ACPToolCall } from './acp-tool-call';
import type { ACPV1Settings } from './v1';

const resolveModel: ACPV1Settings['resolveModel'] = () => ({});

describe('createACP built-in tool inference', () => {
  test('keeps the local ACP tool-call type aligned with the protocol SDK', () => {
    expectTypeOf<ACPToolCall>().toExtend<ToolCall>();
    expectTypeOf<ToolCall>().toExtend<ACPToolCall>();
  });

  test('separates version-independent settings from ACP v1 settings', () => {
    expectTypeOf<
      Extract<
        keyof ACPV1Settings,
        | 'builtinTools'
        | 'port'
        | 'portEndpoint'
        | 'startupTimeoutMs'
        | 'clientApp'
      >
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Omit<
        ACPHarnessSettings,
        | 'builtinTools'
        | 'port'
        | 'portEndpoint'
        | 'startupTimeoutMs'
        | 'clientApp'
      >
    >().toEqualTypeOf<ACPV1Settings>();
  });

  test('requires a model resolver', () => {
    // @ts-expect-error resolveModel is required for every ACP implementation
    createACP({
      harnessId: 'missing-model-resolver',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
    });
  });

  test('preserves the supplied tool set type', () => {
    const bash = commonTool('bash', {
      nativeName: 'shell',
      inputSchema: z.object({ command: z.string() }),
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      source: {
        type: 'npm-simple',
        packageName: '@agentclientprotocol/codex-acp',
        packageVersion: '1.1.4',
      },
      executable: 'codex-acp',
      resolveModel,
      builtinTools: { bash },
      clientApp: { name: 'example-app', version: '1.2.3' },
    });

    expectTypeOf(harness.builtinTools).toEqualTypeOf<{ bash: typeof bash }>();
  });

  test('accepts discriminated npm and install command sources', () => {
    createACP({
      harnessId: 'simple-acp',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
        packageVersion: '1.2.3',
      },
      executable: 'acp-agent',
      resolveModel,
    });
    createACP({
      harnessId: 'unpinned-acp',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
      resolveModel,
    });
    createACP({
      harnessId: 'locked-acp',
      source: {
        type: 'npm-locked',
        packageJson: '{"private":true}',
        pnpmLockYaml: "lockfileVersion: '9.0'\n",
      },
      executable: 'acp-agent',
      resolveModel,
    });
    createACP({
      harnessId: 'install-command-acp',
      source: {
        type: 'install-command',
        command: 'curl https://example.com/install -fsS | bash',
      },
      executable: 'acp-agent',
      resolveModel,
    });
  });

  test('accepts native instruction mappings', () => {
    createACP({
      harnessId: 'claude-acp',
      source: {
        type: 'npm-simple',
        packageName: '@agentclientprotocol/claude-agent-acp',
      },
      executable: 'claude-agent-acp',
      resolveModel,
      skillsDirectory: '.claude/skills',
      instructionMapping: {
        type: 'session-meta',
        path: ['systemPrompt', 'append'],
      },
    });
    createACP({
      harnessId: 'codex-acp',
      source: {
        type: 'npm-simple',
        packageName: '@agentclientprotocol/codex-acp',
      },
      executable: 'codex-acp',
      resolveModel,
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
    });
  });

  test('accepts asynchronous credential forwarding', () => {
    createACP({
      harnessId: 'credential-forwarding-acp',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
      resolveModel,
      credentialForwarding: async ({ credential, environmentVariableName }) =>
        `${environmentVariableName}:${credential}`,
    });
  });
});
