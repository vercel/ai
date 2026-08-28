import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { z } from 'zod';

const workflowSource = ['../../../../packages/workflow/src', 'index.ts'].join(
  '/',
);
const { WorkflowAgent } = await import(
  new URL(workflowSource, import.meta.url).href
);

const finishPart = {
  type: 'finish' as const,
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 1,
      text: 1,
      reasoning: undefined,
    },
  },
  providerMetadata: {},
};

function createToolCallModel(toolName: string) {
  let callCount = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      if (callCount++ === 0) {
        return {
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            {
              type: 'tool-call' as const,
              toolCallId: 'call-1',
              toolName,
              input: '{}',
            },
            {
              ...finishPart,
              finishReason: {
                unified: 'tool-calls' as const,
                raw: 'tool-calls',
              },
            },
          ]),
        };
      }

      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: 'text-1' },
          {
            type: 'text-delta' as const,
            id: 'text-1',
            delta: 'done',
          },
          { type: 'text-end' as const, id: 'text-1' },
          finishPart,
        ]),
      };
    },
  });
}

function createTextModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: 'text-1' },
        { type: 'text-delta' as const, id: 'text-1', delta: 'done' },
        { type: 'text-end' as const, id: 'text-1' },
        finishPart,
      ]),
    }),
  });
}

function waitForToolStart() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function abortAwareOperation(
  abortSignal: AbortSignal | undefined,
  fallbackMs = 100,
) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, fallbackMs);

    const abort = () => {
      clearTimeout(timeout);
      reject(abortSignal?.reason);
    };

    if (abortSignal?.aborted) {
      abort();
      return;
    }

    abortSignal?.addEventListener('abort', abort, { once: true });
  });
}

async function runExplicitSignalScenario() {
  const controller = new AbortController();
  const started = waitForToolStart();
  let receivedSignal: AbortSignal | undefined;
  let cooperativelyCancelled = false;

  const agent = new WorkflowAgent({
    model: createToolCallModel('inspectSignal'),
    tools: {
      inspectSignal: tool({
        inputSchema: z.object({}),
        execute: async (_input, { abortSignal }) => {
          receivedSignal = abortSignal;
          started.resolve();
          try {
            await abortAwareOperation(abortSignal);
          } catch {
            cooperativelyCancelled = true;
          }
          return { cooperativelyCancelled };
        },
      }),
    },
  });

  const streamPromise = agent.stream({
    prompt: 'Call inspectSignal.',
    abortSignal: controller.signal,
  });

  await started.promise;
  controller.abort(new Error('explicit cancellation'));
  await streamPromise;

  return {
    receivedSignal: receivedSignal !== undefined,
    sameSignal: receivedSignal === controller.signal,
    cooperativelyCancelled,
  };
}

async function runTimeoutScenario() {
  const started = waitForToolStart();
  let receivedSignal: AbortSignal | undefined;
  let cooperativelyCancelled = false;

  const agent = new WorkflowAgent({
    model: createToolCallModel('inspectTimeoutSignal'),
    tools: {
      inspectTimeoutSignal: tool({
        inputSchema: z.object({}),
        execute: async (_input, { abortSignal }) => {
          receivedSignal = abortSignal;
          started.resolve();
          try {
            await abortAwareOperation(abortSignal);
          } catch {
            cooperativelyCancelled = true;
          }
          return { cooperativelyCancelled };
        },
      }),
    },
  });

  const streamPromise = agent.stream({
    prompt: 'Call inspectTimeoutSignal.',
    timeout: 25,
  });

  await started.promise;
  await streamPromise;

  return {
    receivedSignal: receivedSignal !== undefined,
    cooperativelyCancelled,
  };
}

async function runApprovedToolScenario() {
  const controller = new AbortController();
  const started = waitForToolStart();
  let receivedSignal: AbortSignal | undefined;
  let cooperativelyCancelled = false;

  const agent = new WorkflowAgent({
    model: createTextModel(),
    tools: {
      approvedTool: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute: async (_input, { abortSignal }) => {
          receivedSignal = abortSignal;
          started.resolve();
          try {
            await abortAwareOperation(abortSignal);
          } catch {
            cooperativelyCancelled = true;
          }
          return { cooperativelyCancelled };
        },
      }),
    },
  });

  const streamPromise = agent.stream({
    messages: [
      { role: 'user', content: 'Run the approved tool.' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'approved-call-1',
            toolName: 'approvedTool',
            input: {},
          },
          {
            type: 'tool-approval-request',
            approvalId: 'approval-approved-call-1',
            toolCallId: 'approved-call-1',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-approved-call-1',
            approved: true,
          },
        ],
      },
    ],
    abortSignal: controller.signal,
  });

  await started.promise;
  controller.abort(new Error('approved tool cancellation'));
  await streamPromise;

  return {
    receivedSignal: receivedSignal !== undefined,
    sameSignal: receivedSignal === controller.signal,
    cooperativelyCancelled,
  };
}

async function main() {
  const explicit = await runExplicitSignalScenario();
  const timeout = await runTimeoutScenario();
  const approved = await runApprovedToolScenario();

  const failures = [
    !explicit.receivedSignal && 'explicit-signal tool received no signal',
    !explicit.sameSignal && 'explicit-signal tool received a different signal',
    !explicit.cooperativelyCancelled &&
      'explicit-signal tool operation was not cancelled',
    !timeout.receivedSignal && 'timeout tool received no signal',
    !timeout.cooperativelyCancelled &&
      'timeout tool operation was not cancelled',
    !approved.receivedSignal && 'approved tool received no signal',
    !approved.sameSignal && 'approved tool received a different signal',
    !approved.cooperativelyCancelled &&
      'approved tool operation was not cancelled',
  ].filter((failure): failure is string => typeof failure === 'string');

  if (failures.length > 0) {
    console.error(
      `ISSUE #19966 REPRODUCED: WorkflowAgent tools cannot cooperatively cancel because abortSignal is missing. ${failures.join(
        '; ',
      )}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'PASS: WorkflowAgent propagated effective abort signals to normal, timeout, and approved tool executions.',
  );
}

main().catch(error => {
  console.error('REPRODUCTION HARNESS ERROR:', error);
  process.exitCode = 2;
});
