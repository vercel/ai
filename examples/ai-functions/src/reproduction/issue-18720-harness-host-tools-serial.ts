import {
  type HarnessV1,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PromptControl,
  type HarnessV1SandboxProvider,
  type HarnessV1Session,
  type HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from 'ai';
import { z } from 'zod';

const TOOL_DELAY_MS = 250;
const FAILURE_SIGNAL = 'ISSUE_18720_REPRODUCED: host tools executed serially';

type Span = {
  name: string;
  start: number;
  end?: number;
};

const zeroUsage = () => ({
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
});

function createHarness(): HarnessV1 {
  const finishEvents: HarnessV1StreamPart[] = [
    {
      type: 'finish-step',
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      totalUsage: zeroUsage(),
    },
  ];

  const createSession = (sessionId: string): HarnessV1Session => {
    const lifecycleState = {
      type: 'resume-session' as const,
      harnessId: 'issue-18720',
      specificationVersion: 'harness-v1' as const,
      data: {},
    };

    return {
      sessionId,
      isResume: false,
      doPromptTurn: async options => {
        const control: HarnessV1PromptControl = {
          submitToolResult: async () => {},
          done: Promise.resolve(),
        };

        queueMicrotask(() => {
          options.emit({
            type: 'tool-call',
            toolCallId: 'call-a',
            toolName: 'analyzeOpinion',
            input: JSON.stringify({ question: 'duty of care' }),
          });
          options.emit({
            type: 'tool-call',
            toolCallId: 'call-b',
            toolName: 'analyzeDocketReport',
            input: JSON.stringify({ question: 'case status' }),
          });
          for (const event of finishEvents) {
            options.emit(event);
          }
        });

        return control;
      },
      doContinueTurn: async () => ({
        submitToolResult: async () => {},
        done: Promise.resolve(),
      }),
      doCompact: async () => {},
      doDetach: async () => lifecycleState,
      doStop: async () => lifecycleState,
      doDestroy: async () => {},
      doSuspendTurn: async () => ({
        type: 'continue-turn',
        harnessId: 'issue-18720',
        specificationVersion: 'harness-v1',
        data: {},
      }),
    };
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-18720',
    builtinTools: {},
    doStart: async options => createSession(options.sessionId),
  };
}

function createSandboxProvider(): HarnessV1SandboxProvider {
  const run = async () => ({ exitCode: 0, stdout: '', stderr: '' });
  const session = {
    id: 'issue-18720-sandbox',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortUrl: async () => 'ws://example.test',
    run,
    stop: async () => {},
    destroy: async () => {},
    restricted: () => ({ run }),
  } as unknown as HarnessV1NetworkSandboxSession;

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'issue-18720-sandbox',
    createSession: async () => session,
    resumeSession: async () => session,
  };
}

async function main() {
  const epoch = performance.now();
  const spans: Span[] = [];
  let activeTools = 0;
  let maxActiveTools = 0;

  const slowTool = (name: string) =>
    tool({
      description: `${name}, independent and safe to call in parallel`,
      inputSchema: z.object({ question: z.string() }),
      execute: async () => {
        activeTools += 1;
        maxActiveTools = Math.max(maxActiveTools, activeTools);

        const span: Span = {
          name,
          start: performance.now() - epoch,
        };
        spans.push(span);
        await new Promise(resolve => setTimeout(resolve, TOOL_DELAY_MS));
        span.end = performance.now() - epoch;

        activeTools -= 1;
        return { answer: `${name} complete` };
      },
    });

  const agent = new HarnessAgent({
    harness: createHarness(),
    sandbox: createSandboxProvider(),
    tools: {
      analyzeOpinion: slowTool('analyzeOpinion'),
      analyzeDocketReport: slowTool('analyzeDocketReport'),
    },
    permissionMode: 'allow-all',
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Call both independent tools in the same turn.',
    });
    for await (const _part of result.fullStream) {
      // Drain the turn so both host tool executions and finish events settle.
    }
  } finally {
    await session.destroy();
  }

  const orderedSpans = spans.filter(
    (span): span is Span & { end: number } => span.end !== undefined,
  );
  const serial =
    orderedSpans.length === 2 &&
    maxActiveTools === 1 &&
    orderedSpans[1]!.start >= orderedSpans[0]!.end;

  console.log(
    JSON.stringify({
      toolDelayMs: TOOL_DELAY_MS,
      maxActiveTools,
      spans: orderedSpans.map(span => ({
        name: span.name,
        startMs: Math.round(span.start),
        endMs: Math.round(span.end),
      })),
    }),
  );

  if (serial) {
    console.error(FAILURE_SIGNAL);
    process.exitCode = 1;
    return;
  }

  if (orderedSpans.length !== 2 || maxActiveTools !== 2) {
    throw new Error(
      `Inconclusive host-tool execution: completed=${orderedSpans.length}, maxActive=${maxActiveTools}`,
    );
  }

  console.log('ISSUE_18720_NOT_REPRODUCED: host tools overlapped');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
