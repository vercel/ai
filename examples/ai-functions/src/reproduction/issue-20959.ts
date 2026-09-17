import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentStreamPart,
} from '@ai-sdk/harness/agent';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import { tool } from 'ai';
import { z } from 'zod/v4';

const command =
  'ls .github/workflows && echo origin/workcell/x && bun run workspace-check';
const corruptedCommand =
  'ls .github.flows && echo origin.cell/x && bun run workspace-check';

function zeroUsage() {
  return {
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
}

function createHarness(): HarnessAgentAdapter {
  const events: HarnessAgentStreamPart[] = [
    { type: 'stream-start' },
    { type: 'tool-input-start', id: 'bash-call', toolName: 'bash' },
    {
      type: 'tool-input-delta',
      id: 'bash-call',
      delta: JSON.stringify({ command }),
    },
    { type: 'tool-input-end', id: 'bash-call' },
    {
      type: 'tool-call',
      toolCallId: 'bash-call',
      toolName: 'bash',
      input: JSON.stringify({ command }),
      providerExecuted: true,
    },
    {
      type: 'tool-result',
      toolCallId: 'bash-call',
      toolName: 'bash',
      result: {
        command,
        path: '/work/.github/workflows/ci.yml',
        branch: 'origin/workcell/ROB-1',
        task: 'workspace-check',
      },
    },
    {
      type: 'file-change',
      event: 'modify',
      path: '/work/.github/workflows/ci.yml',
    },
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'end_turn' },
      totalUsage: zeroUsage(),
    },
  ];

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-20959',
    builtinTools: {
      bash: tool({
        inputSchema: z.object({ command: z.string() }),
      }),
    },
    doStart: async ({ sessionId }) => ({
      sessionId,
      isResume: false,
      doPromptTurn: async ({ emit }) => {
        queueMicrotask(() => {
          for (const event of events) {
            emit(event);
          }
        });
        return {
          submitToolResult: async () => {},
          done: Promise.resolve(),
        };
      },
      doCompact: async () => {},
      doContinueTurn: async () => ({
        submitToolResult: async () => {},
        done: Promise.resolve(),
      }),
      doSuspendTurn: async () => ({
        type: 'continue-turn',
        harnessId: 'issue-20959',
        specificationVersion: 'harness-v1',
        data: {},
      }),
      doDetach: async () => ({
        type: 'resume-session',
        harnessId: 'issue-20959',
        specificationVersion: 'harness-v1',
        data: {},
      }),
      doStop: async () => ({
        type: 'resume-session',
        harnessId: 'issue-20959',
        specificationVersion: 'harness-v1',
        data: {},
      }),
      doDestroy: async () => {},
    }),
  };
}

function createSandboxProvider(): HarnessV1SandboxProvider {
  const run = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const session = {
    id: 'issue-20959-sandbox',
    defaultWorkingDirectory: '/',
    ports: [],
    run,
    restricted: () => ({ run }),
    getPortEndpoint: async () => ({ url: 'ws://example.test' }),
    getPortUrl: async () => 'ws://example.test',
    stop: async () => {},
    destroy: async () => {},
  } as unknown as HarnessV1NetworkSandboxSession;

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'issue-20959-sandbox',
    createSession: async () => session,
  };
}

async function main() {
  const agent = new HarnessAgent({
    harness: createHarness(),
    sandbox: createSandboxProvider(),
    sandboxConfig: { workDir: 'work' },
  });
  const session = await agent.createSession({ sessionId: 'reproduction' });
  const result = await agent.stream({
    session,
    prompt: 'Run the reported commands.',
  });
  const parts = [];
  for await (const part of result.fullStream) {
    parts.push(part);
  }
  await session.destroy();

  const inputDelta = parts.find(
    part => part.type === 'tool-input-delta' && part.id === 'bash-call',
  );
  const toolCall = parts.find(
    part => part.type === 'tool-call' && part.toolCallId === 'bash-call',
  );
  const toolResult = parts.find(
    part => part.type === 'tool-result' && part.toolCallId === 'bash-call',
  );
  const fileChange = parts.find(
    part => part.type === 'tool-call' && part.toolName === 'fileChange',
  );

  const observed = {
    inputDelta:
      inputDelta?.type === 'tool-input-delta' ? inputDelta.delta : undefined,
    toolCall: toolCall?.type === 'tool-call' ? toolCall.input : undefined,
    toolResult:
      toolResult?.type === 'tool-result' ? toolResult.output : undefined,
    fileChange: fileChange?.type === 'tool-call' ? fileChange.input : undefined,
  };
  const expected = {
    inputDelta: JSON.stringify({ command }),
    toolCall: { command },
    toolResult: {
      command,
      path: '.github/workflows/ci.yml',
      branch: 'origin/workcell/ROB-1',
      task: 'workspace-check',
    },
    fileChange: {
      event: 'modify',
      path: '.github/workflows/ci.yml',
    },
  };

  if (JSON.stringify(observed) === JSON.stringify(expected)) {
    return;
  }

  const knownCorruption = {
    inputDelta: JSON.stringify({ command: corruptedCommand }),
    toolCall: { command: corruptedCommand },
    toolResult: {
      command: corruptedCommand,
      path: '.github.flows/ci.yml',
      branch: 'origin.cell/ROB-1',
      task: 'workspace-check',
    },
    fileChange: {
      event: 'modify',
      path: '.github.flows/ci.yml',
    },
  };

  if (JSON.stringify(observed) === JSON.stringify(knownCorruption)) {
    console.error(
      'ISSUE_20959_REPRODUCED: HarnessAgent corrupted host-visible stream content',
    );
    console.error(JSON.stringify(observed, null, 2));
    process.exitCode = 1;
    return;
  }

  throw new Error(
    `Unexpected stream output while checking issue #20959: ${JSON.stringify(observed)}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
