import { streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const usage = {
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
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function toolCall(toolCallId: string, toolName: string) {
  return {
    type: 'tool-call' as const,
    toolCallId,
    toolName,
    input: '{}',
  };
}

async function runConcurrentCompletionScenario() {
  const firstResult = deferred<string>();
  const secondResult = deferred<string>();

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          toolCall('call-1', 'firstTool'),
          toolCall('call-2', 'secondTool'),
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      }),
    }),
    prompt: 'Run both tools.',
    tools: {
      firstTool: tool({
        inputSchema: z.object({}),
        execute: () => firstResult.promise,
      }),
      secondTool: tool({
        inputSchema: z.object({}),
        execute: () => secondResult.promise,
      }),
    },
  });

  const parts: Array<{ type: string }> = [];
  const consume = (async () => {
    for await (const part of result.fullStream) {
      parts.push(part);
    }
  })();

  await new Promise<void>(resolve => setTimeout(resolve, 0));
  firstResult.resolve('first-result');
  secondResult.resolve('second-result');
  await consume;

  const toolResultCount = parts.filter(
    part => part.type === 'tool-result',
  ).length;
  if (
    toolResultCount !== 2 ||
    !parts.some(part => part.type === 'finish-step')
  ) {
    throw new Error(
      `Concurrent completion lost output: toolResults=${toolResultCount}`,
    );
  }
}

async function runClosedStreamCallbackScenario() {
  let modelController!: ReadableStreamDefaultController<any>;
  const streamingToolGate = deferred<void>();
  const successfulToolGate = deferred<string>();
  const modelError = new Error('expected model stream failure');
  let observedModelError = false;
  let observedToolCalls = 0;
  const toolCallsObserved = deferred<void>();

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            modelController = controller;
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue(toolCall('call-streaming', 'streamingTool'));
            controller.enqueue(toolCall('call-success', 'successfulTool'));
          },
        }),
      }),
    }),
    prompt: 'Run both tools.',
    tools: {
      streamingTool: tool({
        inputSchema: z.object({}),
        async *execute() {
          await streamingToolGate.promise;
          yield 'preliminary-result';
          yield 'final-result';
        },
      }),
      successfulTool: tool({
        inputSchema: z.object({}),
        execute: () => successfulToolGate.promise,
      }),
    },
    experimental_onToolCallFinish({ toolCall }) {
      if (toolCall.toolName === 'streamingTool') {
        throw new Error('intentional callback rejection');
      }
    },
  });

  const consume = (async () => {
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'tool-call') {
          observedToolCalls++;
          if (observedToolCalls === 2) {
            toolCallsObserved.resolve();
          }
        }
        if (part.type === 'error' && part.error === modelError) {
          observedModelError = true;
        }
      }
    } catch (error) {
      if (error === modelError) {
        observedModelError = true;
      } else {
        throw error;
      }
    }
  })();

  await toolCallsObserved.promise;
  modelController.error(modelError);

  // Let the model failure close/cancel the tool-results stream before the
  // fire-and-forget tool callbacks attempt preliminary, success, error, and
  // finalization writes.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  streamingToolGate.resolve();
  successfulToolGate.resolve('successful-result');

  await consume;
  await new Promise<void>(resolve => setTimeout(resolve, 0));

  if (!observedModelError) {
    throw new Error('The expected model stream failure was not surfaced.');
  }
}

async function main() {
  const processErrors: unknown[] = [];
  const recordProcessError = (error: unknown) => {
    processErrors.push(error);
  };

  process.on('unhandledRejection', recordProcessError);
  process.on('uncaughtException', recordProcessError);

  try {
    await runConcurrentCompletionScenario();
    await runClosedStreamCallbackScenario();

    if (processErrors.length > 0) {
      throw new Error(
        `Unexpected process errors: ${processErrors
          .map(error => String(error))
          .join(' | ')}`,
      );
    }

    console.log(
      'PASS: concurrent tool completion and callbacks after stream closure did not enqueue into a closed stream.',
    );
  } finally {
    process.off('unhandledRejection', recordProcessError);
    process.off('uncaughtException', recordProcessError);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
