import { commonTool } from '@ai-sdk/harness';
import type { ToolCall } from '@agentclientprotocol/sdk';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';
import { createACP, type ACPHarnessSettings } from './acp-harness';
import type { ACPToolCall } from './acp-tool-call';
import type { ACPV1Settings } from './v1';

const modelMapping: ACPV1Settings['modelMapping'] = {
  type: 'session-config-option',
  path: 'model',
};

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

  test('requires a model mapping', () => {
    // @ts-expect-error modelMapping is required for every ACP implementation
    createACP({
      harnessId: 'missing-model-mapping',
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
      modelMapping,
      builtinTools: { bash },
      clientApp: { name: 'example-app', version: '1.2.3' },
    });

    expectTypeOf(harness.builtinTools).toEqualTypeOf<{ bash: typeof bash }>();
  });

  test('adds askUserQuestions only when configured', () => {
    const withoutQuestions = createACP({
      harnessId: 'without-questions',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
      modelMapping,
    });
    expectTypeOf<
      keyof typeof withoutQuestions.builtinTools
    >().toEqualTypeOf<never>();

    const withQuestions = createACP({
      harnessId: 'with-questions',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
      modelMapping,
      askUserQuestions: {
        requestMethod: 'example/ask',
        fromNativeRequest: () => null,
        toNativeResponse: () => null,
      },
    });
    expectTypeOf<
      keyof typeof withQuestions.builtinTools
    >().toEqualTypeOf<'askUserQuestions'>();
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
      modelMapping,
    });
    createACP({
      harnessId: 'unpinned-acp',
      source: {
        type: 'npm-simple',
        packageName: '@example/acp-agent',
      },
      executable: 'acp-agent',
      modelMapping,
    });
    createACP({
      harnessId: 'locked-acp',
      source: {
        type: 'npm-locked',
        packageJson: '{"private":true}',
        pnpmLockYaml: "lockfileVersion: '9.0'\n",
      },
      executable: 'acp-agent',
      modelMapping,
    });
    createACP({
      harnessId: 'install-command-acp',
      source: {
        type: 'install-command',
        command: 'curl https://example.com/install -fsS | bash',
      },
      executable: 'acp-agent',
      modelMapping,
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
      modelMapping,
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
      modelMapping,
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
      modelMapping,
      credentialForwarding: async ({ credential, environmentVariableName }) =>
        `${environmentVariableName}:${credential}`,
    });
  });
});
