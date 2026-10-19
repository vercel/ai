import {
  commonTool,
  type HarnessV1,
  type HarnessV1ContinueTurnOptions,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PromptControl,
  type HarnessV1PromptTurnOptions,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { z } from 'zod/v4';

const firstToolCallId = 'toolu_first';
const secondToolCallId = 'toolu_second';

const zeroUsage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
};

function emitLater(
  emit: (part: HarnessV1StreamPart) => void,
  parts: HarnessV1StreamPart[],
): void {
  queueMicrotask(() => {
    for (const part of parts) {
      emit(part);
    }
  });
}

function createControl(): HarnessV1PromptControl {
  return {
    submitToolApproval: async () => {},
    submitToolResult: async () => {},
    done: Promise.resolve(),
  };
}

function createHarness(): HarnessV1 {
  let continuationCount = 0;

  const session: HarnessV1Session = {
    sessionId: 'issue-23499',
    isResume: false,
    doPromptTurn: async (options: HarnessV1PromptTurnOptions) => {
      emitLater(options.emit, [
        {
          type: 'tool-call',
          toolCallId: firstToolCallId,
          toolName: 'bash',
          nativeName: 'Bash',
          input: JSON.stringify({ command: 'find . -maxdepth 1 -type f' }),
          providerExecuted: true,
        },
        {
          type: 'tool-call',
          toolCallId: secondToolCallId,
          toolName: 'bash',
          nativeName: 'Bash',
          input: JSON.stringify({ command: 'cat package.json' }),
          providerExecuted: true,
        },
        {
          type: 'tool-approval-request',
          approvalId: firstToolCallId,
          toolCallId: firstToolCallId,
        },
        {
          type: 'finish-step',
          finishReason: { unified: 'tool-calls', raw: 'host-input' },
          usage: zeroUsage,
        },
      ]);
      return createControl();
    },
    doContinueTurn: async (options: HarnessV1ContinueTurnOptions) => {
      continuationCount += 1;
      if (continuationCount === 1) {
        // Claude Code already emitted both calls in the first stream. Its
        // second permission callback therefore emits only this approval.
        emitLater(options.emit, [
          {
            type: 'tool-approval-request',
            approvalId: secondToolCallId,
            toolCallId: secondToolCallId,
          },
          {
            type: 'finish-step',
            finishReason: { unified: 'tool-calls', raw: 'host-input' },
            usage: zeroUsage,
          },
        ]);
      } else {
        emitLater(options.emit, [
          {
            type: 'tool-result',
            toolCallId: firstToolCallId,
            toolName: 'bash',
            result: 'package.json',
          },
          {
            type: 'tool-result',
            toolCallId: secondToolCallId,
            toolName: 'bash',
            result: '{"name":"fixture"}',
          },
          {
            type: 'finish-step',
            finishReason: { unified: 'tool-calls', raw: 'tool_use' },
            usage: zeroUsage,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'end_turn' },
            totalUsage: zeroUsage,
          },
        ]);
      }
      return createControl();
    },
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'claude-code',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'claude-code',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'claude-code',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'claude-code',
    supportsBuiltinToolApprovals: true,
    builtinTools: {
      bash: commonTool('bash', {
        nativeName: 'Bash',
        toolUseKind: 'bash',
        inputSchema: z.object({ command: z.string() }),
      }),
    },
    doStart: async () => session,
  };
}

function createSandboxSession(): HarnessV1NetworkSandboxSession {
  const run = async ({ command }: { command: string }) => ({
    exitCode: 0,
    stdout:
      command === 'printf "%s" "$HOME"'
        ? '/home/agent'
        : command === 'pwd'
          ? '/work\n'
          : '',
    stderr: '',
  });
  const files = new Map<string, string>();
  const readTextFile = async ({ path }: { path: string }) =>
    files.get(path) ?? null;
  const writeTextFile = async ({
    path,
    content,
  }: {
    path: string;
    content: string;
  }) => {
    files.set(path, content);
  };

  return {
    id: 'issue-23499-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run,
    readTextFile,
    writeTextFile,
    stop: async () => {},
    destroy: async () => {},
    restricted: () => ({ run, readTextFile, writeTextFile }),
  } as unknown as HarnessV1NetworkSandboxSession;
}

async function consumeApproval(
  result: Awaited<ReturnType<HarnessAgent['stream']>>,
): Promise<string> {
  let approvalId: string | undefined;

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      const message =
        part.error instanceof Error ? part.error.message : String(part.error);
      if (
        message.includes(
          `emitted approval request '${secondToolCallId}' for unknown tool call '${secondToolCallId}'`,
        )
      ) {
        throw new Error(`ISSUE #23499 REPRODUCED: ${message}`);
      }
      throw part.error;
    }
    if (part.type === 'tool-approval-request') {
      approvalId = part.approvalId;
    }
  }

  if (approvalId == null) {
    throw new Error('Expected the stream to emit a tool approval request.');
  }
  return approvalId;
}

async function main(): Promise<void> {
  const agent = new HarnessAgent({
    harness: createHarness(),
    permissionMode: 'allow-reads',
  });
  const session = await agent.createSession({
    sandboxSession: createSandboxSession(),
  });

  try {
    const first = await agent.stream({
      session,
      prompt: 'Inspect the repository with both Bash commands in parallel.',
    });
    const firstApprovalId = await consumeApproval(first);

    const second = await agent.continueStream({
      session,
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: firstApprovalId,
          approved: true,
        },
      ],
    });
    const secondApprovalId = await consumeApproval(second);

    const final = await agent.continueStream({
      session,
      toolApprovalContinuations: [
        {
          type: 'tool-approval-response',
          approvalId: secondApprovalId,
          approved: true,
        },
      ],
    });
    await final.consumeStream();
  } finally {
    await session.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
