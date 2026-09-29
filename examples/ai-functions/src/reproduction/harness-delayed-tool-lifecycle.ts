import {
  HarnessAgent,
  type HarnessAgentAdapter,
  type HarnessAgentAdapterSession,
  type HarnessAgentPromptTurnOptions,
  type HarnessAgentStreamPart,
} from '@ai-sdk/harness/agent';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { tool } from 'ai';
import { z } from 'zod';

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

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

async function main() {
  const startedAt = performance.now();
  const events: string[] = [];

  const record = (event: string) => {
    events.push(event);
    console.log(`${Math.round(performance.now() - startedAt)}ms ${event}`);
  };

  const harness: HarnessAgentAdapter = {
    specificationVersion: 'harness-v1',
    harnessId: 'issue-21685-reproduction',
    builtinTools: {},
    async doStart({ sessionId }) {
      const session: HarnessAgentAdapterSession = {
        sessionId,
        isResume: false,
        async doPromptTurn(options: HarnessAgentPromptTurnOptions) {
          let resolveDone!: () => void;
          const done = new Promise<void>(resolve => {
            resolveDone = resolve;
          });
          const completedToolCalls = new Set<string>();

          queueMicrotask(() => {
            options.emit({
              type: 'stream-start',
              modelId: 'mock-model',
            });
            options.emit({
              type: 'tool-call',
              toolCallId: 'fast-call',
              toolName: 'work',
              input: JSON.stringify({ label: 'fast', delayMs: 20 }),
              stepToolCallCount: 2,
            });
            options.emit({
              type: 'tool-call',
              toolCallId: 'slow-call',
              toolName: 'work',
              input: JSON.stringify({ label: 'slow', delayMs: 200 }),
              stepToolCallCount: 2,
            });
          });

          return {
            async submitToolResult(submission) {
              const label =
                submission.toolCallId === 'fast-call' ? 'fast' : 'slow';
              record(`runtime-received-result:${label}`);
              options.emit({
                type: 'tool-result',
                toolCallId: submission.toolCallId,
                toolName: 'work',
                result: submission.output as { label: string },
                ...(submission.isError === true ? { isError: true } : {}),
              });
              completedToolCalls.add(submission.toolCallId);

              if (completedToolCalls.size === 2) {
                options.emit({
                  type: 'finish-step',
                  finishReason: { unified: 'stop', raw: 'end_turn' },
                  usage: zeroUsage(),
                });
                options.emit({
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'end_turn' },
                  totalUsage: zeroUsage(),
                });
                resolveDone();
              }
            },
            done,
          };
        },
        async doContinueTurn() {
          throw new Error('This reproduction does not continue turns.');
        },
        async doCompact() {},
        async doDetach() {
          return {
            type: 'resume-session',
            harnessId: 'issue-21685-reproduction',
            specificationVersion: 'harness-v1',
            data: {},
          };
        },
        async doSuspendTurn() {
          return {
            type: 'continue-turn',
            harnessId: 'issue-21685-reproduction',
            specificationVersion: 'harness-v1',
            data: {},
          };
        },
        async doStop() {
          return {
            type: 'resume-session',
            harnessId: 'issue-21685-reproduction',
            specificationVersion: 'harness-v1',
            data: {},
          };
        },
        async doDestroy() {},
      };

      return session;
    },
  };

  const sandboxSession = {
    description: 'In-memory reproduction sandbox',
    defaultWorkingDirectory: '/work',
    async run() {
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    async readFile() {
      return null;
    },
    async readBinaryFile() {
      return null;
    },
    async readTextFile() {
      return null;
    },
    async writeFile() {},
    async writeBinaryFile() {},
    async writeTextFile() {},
    async spawn() {
      throw new Error('This reproduction does not spawn sandbox processes.');
    },
  } as Experimental_SandboxSession & {
    defaultWorkingDirectory: string;
  };

  const agent = new HarnessAgent({
    harness,
    tools: {
      work: tool({
        inputSchema: z.object({
          label: z.enum(['fast', 'slow']),
          delayMs: z.number(),
        }),
        execute: async ({ label, delayMs }) => {
          record(`execute-start:${label}`);
          await sleep(delayMs);
          record(`execute-end:${label}`);
          return { label };
        },
      }),
    },
    onToolExecutionStart: ({ toolCall }) => {
      const input = toolCall.input as { label: string };
      record(`callback-start:${input.label}`);
    },
    onToolExecutionEnd: ({ toolCall }) => {
      const input = toolCall.input as { label: string };
      record(`callback-end:${input.label}`);
    },
  });

  const session = await agent.createSession({ sandboxSession });
  try {
    const result = await agent.stream({ session, prompt: 'run both tools' });
    for await (const part of result.fullStream) {
      if (part.type === 'tool-result') {
        const output = part.output as { label: string };
        record(`stream-result:${output.label}`);
      } else if (part.type === 'finish-step') {
        record('stream-finish-step');
      }
    }
  } finally {
    await session.destroy();
  }

  const requiredEvents = [
    'callback-start:fast',
    'execute-start:fast',
    'execute-end:fast',
    'callback-end:fast',
    'stream-result:fast',
    'callback-start:slow',
    'execute-start:slow',
    'execute-end:slow',
    'callback-end:slow',
    'stream-result:slow',
    'stream-finish-step',
  ];
  const missingEvents = requiredEvents.filter(event => !events.includes(event));
  if (missingEvents.length > 0) {
    throw new Error(
      `REPRODUCTION HARNESS ERROR: missing events: ${missingEvents.join(', ')}`,
    );
  }

  const occursBefore = (first: string, second: string) =>
    events.indexOf(first) < events.indexOf(second);
  const violations: string[] = [];

  for (const label of ['fast', 'slow']) {
    if (!occursBefore(`callback-start:${label}`, `execute-start:${label}`)) {
      violations.push(`${label} start callback ran after execute started`);
    }
    if (!occursBefore(`execute-end:${label}`, `callback-end:${label}`)) {
      violations.push(`${label} end callback ran before execute completed`);
    }
  }

  if (!occursBefore('callback-end:fast', 'execute-end:slow')) {
    violations.push('fast end callback waited for the slow tool');
  }
  if (!occursBefore('stream-result:fast', 'execute-end:slow')) {
    violations.push('fast tool-result waited for the slow tool');
  }
  if (!occursBefore('stream-result:slow', 'stream-finish-step')) {
    violations.push('finish-step arrived before the slow tool-result');
  }

  if (violations.length > 0) {
    throw new Error(
      `ISSUE #21685 REPRODUCED: harness delayed tool lifecycle events until the step boundary\n${violations.join('\n')}`,
    );
  }

  console.log(
    'Issue #21685 was not reproduced: lifecycle callbacks and results were delivered around each tool execution.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
