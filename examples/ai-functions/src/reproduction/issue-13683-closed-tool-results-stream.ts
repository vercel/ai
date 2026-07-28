import { streamText, tool } from 'ai';
import { MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod/v4';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function waitForTurns() {
  return new Promise(resolve => setTimeout(resolve, 20));
}

function createControlledModel() {
  let controller!: ReadableStreamDefaultController<any>;

  const model = new MockLanguageModelV2({
    doStream: async () => ({
      stream: new ReadableStream({
        start(streamController) {
          controller = streamController;
          streamController.enqueue({ type: 'stream-start', warnings: [] });
          streamController.enqueue({
            type: 'tool-call',
            toolCallId: 'preliminary-call',
            toolName: 'preliminaryTool',
            input: '{}',
          });
          streamController.enqueue({
            type: 'tool-call',
            toolCallId: 'success-call',
            toolName: 'successTool',
            input: '{}',
          });
          streamController.enqueue({
            type: 'tool-call',
            toolCallId: 'failure-call',
            toolName: 'failureTool',
            input: '{}',
          });
        },
      }),
    }),
  });

  return {
    model,
    error(error: unknown) {
      controller.error(error);
    },
    finish() {
      controller.enqueue({
        type: 'finish',
        finishReason: 'tool-calls',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
        },
      });
      controller.close();
    },
  };
}

function createTools() {
  const preliminaryGate = deferred<void>();
  const successGate = deferred<string>();
  const failureGate = deferred<void>();

  return {
    gates: {
      preliminaryGate,
      successGate,
      failureGate,
    },
    tools: {
      preliminaryTool: tool({
        inputSchema: z.object({}),
        async *execute() {
          await preliminaryGate.promise;
          yield 'preliminary';
          yield 'final';
        },
      }),
      successTool: tool({
        inputSchema: z.object({}),
        execute: () => successGate.promise,
      }),
      failureTool: tool({
        inputSchema: z.object({}),
        async execute() {
          await failureGate.promise;
          throw new Error('expected tool failure');
        },
      }),
    },
  };
}

async function readToolCalls(
  reader: ReadableStreamDefaultReader<any>,
  count: number,
) {
  const toolCallIds: string[] = [];

  while (toolCallIds.length < count) {
    const { done, value } = await reader.read();
    if (done) {
      throw new Error('stream ended before all tool calls were observed');
    }
    if (value.type === 'tool-call') {
      toolCallIds.push(value.toolCallId);
    }
  }

  return toolCallIds;
}

function releaseTools(gates: ReturnType<typeof createTools>['gates']) {
  gates.preliminaryGate.resolve();
  gates.successGate.resolve('success');
  gates.failureGate.resolve();
}

async function verifyConcurrentCompletion() {
  const controlledModel = createControlledModel();
  const { gates, tools } = createTools();
  const result = streamText({
    model: controlledModel.model,
    prompt: 'run tools',
    tools,
  });
  const reader = result.fullStream.getReader();

  await readToolCalls(reader, 3);
  controlledModel.finish();
  releaseTools(gates);

  const chunks: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  const finalToolResults = chunks.filter(
    chunk => chunk.type === 'tool-result' && chunk.preliminary !== true,
  );
  const preliminaryToolResults = chunks.filter(
    chunk => chunk.type === 'tool-result' && chunk.preliminary === true,
  );
  const toolErrors = chunks.filter(chunk => chunk.type === 'tool-error');
  const finishes = chunks.filter(chunk => chunk.type === 'finish');

  if (
    finalToolResults.length !== 2 ||
    preliminaryToolResults.length !== 2 ||
    toolErrors.length !== 1 ||
    finishes.length !== 1
  ) {
    throw new Error(
      `unexpected concurrent output: ${JSON.stringify({
        finalToolResults: finalToolResults.length,
        preliminaryToolResults: preliminaryToolResults.length,
        toolErrors: toolErrors.length,
        finishes: finishes.length,
      })}`,
    );
  }

  return {
    finalToolResults: finalToolResults.length,
    preliminaryToolResults: preliminaryToolResults.length,
    toolErrors: toolErrors.length,
    finishes: finishes.length,
  };
}

async function verifyModelFailure() {
  const controlledModel = createControlledModel();
  const { gates, tools } = createTools();
  const result = streamText({
    model: controlledModel.model,
    prompt: 'run tools',
    tools,
  });
  const reader = result.fullStream.getReader();

  await readToolCalls(reader, 3);

  const modelError = new Error('expected model stream error');
  controlledModel.error(modelError);

  try {
    await reader.read();
    throw new Error('model stream error did not reach the consumer');
  } catch (error) {
    if (error !== modelError) {
      throw error;
    }
  }

  releaseTools(gates);
  await waitForTurns();

  return 'expected model stream error';
}

async function verifyCancellationAndRestart() {
  const controlledModel = createControlledModel();
  const { gates, tools } = createTools();
  const cancelledResult = streamText({
    model: controlledModel.model,
    prompt: 'run tools',
    tools,
  });
  const cancelledReader = cancelledResult.fullStream.getReader();

  await readToolCalls(cancelledReader, 3);
  await cancelledReader.cancel('replace request');

  const replacementModel = new MockLanguageModelV2({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'replacement completed',
          });
          controller.enqueue({ type: 'text-end', id: 'text-1' });
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          });
          controller.close();
        },
      }),
    }),
  });

  const replacement = streamText({
    model: replacementModel,
    prompt: 'replacement',
  });

  releaseTools(gates);

  const replacementChunks: any[] = [];
  for await (const chunk of replacement.fullStream) {
    replacementChunks.push(chunk);
  }
  await waitForTurns();

  const text = replacementChunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.text)
    .join('');

  if (text !== 'replacement completed') {
    throw new Error(`replacement stream failed: ${JSON.stringify(text)}`);
  }

  return text;
}

async function main() {
  const processErrors: string[] = [];
  const onUncaughtException = (error: unknown) => {
    processErrors.push(`uncaughtException: ${String(error)}`);
  };
  const onUnhandledRejection = (error: unknown) => {
    processErrors.push(`unhandledRejection: ${String(error)}`);
  };

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const concurrentCompletion = await verifyConcurrentCompletion();
    const propagatedModelError = await verifyModelFailure();
    const replacementText = await verifyCancellationAndRestart();

    await waitForTurns();

    if (processErrors.length > 0) {
      throw new Error(
        `closed tool-results stream produced process errors: ${processErrors.join(
          ' | ',
        )}`,
      );
    }

    console.log(
      JSON.stringify({
        concurrentCompletion,
        propagatedModelError,
        replacementText,
        processErrors,
      }),
    );
  } finally {
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
