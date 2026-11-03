import { commonTool } from '@ai-sdk/harness';
import type { SandboxChannelReconnectOptions } from '@ai-sdk/harness/utils';
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

const source: ACPV1Settings['source'] = {
  type: 'install-command',
  command: 'curl https://example.com/install -fsS | bash',
};

const toolCallSettings = {
  resolveHostToolCall: () => undefined,
  isMcpToolCall: () => false,
} satisfies Pick<ACPHarnessSettings, 'isMcpToolCall' | 'resolveHostToolCall'>;

describe('createACP built-in tool inference', () => {
  test('accepts only image as a non-text content type', () => {
    expectTypeOf<ACPV1Settings['nonTextContentTypes']>().toEqualTypeOf<
      ReadonlyArray<'image'> | undefined
    >();
    expectTypeOf<ReadonlyArray<'text' | 'audio'>>().not.toExtend<
      NonNullable<ACPV1Settings['nonTextContentTypes']>
    >();
  });

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
        | 'reconnect'
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
        | 'reconnect'
        | 'clientApp'
      >
    >().toEqualTypeOf<ACPV1Settings>();
  });

  test('requires a model mapping', () => {
    // @ts-expect-error modelMapping is required for every ACP agent
    createACP({
      harnessId: 'missing-model-mapping',
      source,
      executable: 'acp-agent',
      ...toolCallSettings,
    });
  });

  test('requires tool call classification and host tool resolution', () => {
    // @ts-expect-error isMcpToolCall is required for every ACP agent
    createACP({
      harnessId: 'missing-mcp-tool-call-classification',
      source,
      executable: 'acp-agent',
      modelMapping,
      resolveHostToolCall: () => undefined,
    });
    // @ts-expect-error resolveHostToolCall is required for every ACP agent
    createACP({
      harnessId: 'missing-host-tool-call-resolution',
      source,
      executable: 'acp-agent',
      modelMapping,
      isMcpToolCall: () => false,
    });
  });

  test('types host tool call resolution', () => {
    expectTypeOf<ACPHarnessSettings['resolveHostToolCall']>().toEqualTypeOf<
      (options: {
        readonly toolCall: ACPToolCall;
        readonly serverName: string;
        readonly toolNames: ReadonlyArray<string>;
      }) =>
        | {
            readonly toolName: string;
            readonly input: Readonly<Record<string, unknown>>;
          }
        | undefined
    >();
  });

  test('accepts sandbox bridge reconnect settings', () => {
    const settings: Pick<ACPHarnessSettings, 'reconnect'> = {
      reconnect: {
        maxElapsedMs: 120_000,
        initialDelayMs: 100,
        maxDelayMs: 5_000,
      },
    };

    expectTypeOf(settings.reconnect).toEqualTypeOf<
      SandboxChannelReconnectOptions | undefined
    >();
  });

  test('preserves the supplied tool set type', () => {
    const bash = commonTool('bash', {
      nativeName: 'shell',
      inputSchema: z.object({ command: z.string() }),
    });
    const harness = createACP({
      harnessId: 'codex-acp',
      source,
      executable: 'codex-acp',
      modelMapping,
      ...toolCallSettings,
      builtinTools: { bash },
      clientApp: { name: 'example-app', version: '1.2.3' },
    });

    expectTypeOf(harness.builtinTools).toEqualTypeOf<{ bash: typeof bash }>();
  });

  test('adds askUserQuestions only when configured', () => {
    const withoutQuestions = createACP({
      harnessId: 'without-questions',
      source,
      executable: 'acp-agent',
      modelMapping,
      ...toolCallSettings,
    });
    expectTypeOf<
      keyof typeof withoutQuestions.builtinTools
    >().toEqualTypeOf<never>();

    const withQuestions = createACP({
      harnessId: 'with-questions',
      source,
      executable: 'acp-agent',
      modelMapping,
      ...toolCallSettings,
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

  test('accepts npm-locked and install-command sources', () => {
    createACP({
      harnessId: 'locked-acp',
      source: {
        type: 'npm-locked',
        packageJson: '{"private":true}',
        pnpmLockYaml: "lockfileVersion: '9.0'\n",
      },
      executable: 'acp-agent',
      modelMapping,
      ...toolCallSettings,
    });
    createACP({
      harnessId: 'install-command-acp',
      source: {
        type: 'install-command',
        command: 'curl https://example.com/install -fsS | bash',
      },
      executable: 'acp-agent',
      modelMapping,
      ...toolCallSettings,
    });
  });

  test('accepts native instruction mappings', () => {
    createACP({
      harnessId: 'claude-acp',
      source,
      executable: 'claude-agent-acp',
      modelMapping,
      ...toolCallSettings,
      skillsDirectory: '.claude/skills',
      instructionMapping: {
        type: 'session-meta',
        path: ['systemPrompt', 'append'],
      },
    });
    createACP({
      harnessId: 'codex-acp',
      source,
      executable: 'codex-acp',
      modelMapping,
      ...toolCallSettings,
      instructionMapping: {
        type: 'launch-env-json',
        variable: 'CODEX_CONFIG',
        path: ['developer_instructions'],
      },
    });
    createACP({
      harnessId: 'cursor-acp',
      source: {
        type: 'install-command',
        command: 'curl https://example.com/install -fsS | bash',
      },
      executable: 'acp-agent',
      modelMapping,
      ...toolCallSettings,
      instructionMapping: {
        type: 'filesystem',
        path: '.cursor/rules/AGENTS.md',
      },
    });
  });

  test('accepts asynchronous credential forwarding', () => {
    createACP({
      harnessId: 'credential-forwarding-acp',
      source,
      executable: 'acp-agent',
      modelMapping,
      ...toolCallSettings,
      credentialForwarding: async ({ credential, environmentVariableName }) =>
        `${environmentVariableName}:${credential}`,
    });
  });
});
