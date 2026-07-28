import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { streamText, tool, type TextStreamPart } from 'ai';
import { z } from 'zod';

const usage: LanguageModelV4Usage = {
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createModel(stream: ReadableStream<LanguageModelV4StreamPart>) {
  return new MockLanguageModelV4({
    doStream: async () => ({ stream }),
  });
}

function createToolCallStream(toolNames: string[]) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });

      for (const [index, toolName] of toolNames.entries()) {
        controller.enqueue({
          type: 'tool-call',
          toolCallId: `call-${index + 1}`,
          toolName,
          input: JSON.stringify({ value: toolName }),
        });
      }

      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage,
      });
      controller.close();
    },
  });
}

async function waitFor(
  condition: () => boolean,
  description: string,
): Promise<void> {
  const timeoutAt = Date.now() + 2_000;

  while (!condition()) {
    if (Date.now() >= timeoutAt) {
      throw new Error(`Reproduction harness timed out: ${description}`);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function runConcurrentCompletionScenario() {
  const releaseTools = createDeferred<void>();
  let startedTools = 0;

  const result = streamText({
    model: createModel(
      createToolCallStream([
        'preliminaryTool',
        'successfulTool',
        'failingTool',
      ]),
    ),
    prompt: 'Run all tools.',
    tools: {
      preliminaryTool: tool({
        inputSchema: z.object({ value: z.string() }),
        async *execute({ value }) {
          startedTools++;
          await releaseTools.promise;
          yield `${value}-preliminary`;
          yield `${value}-final`;
        },
      }),
      successfulTool: tool({
        inputSchema: z.object({ value: z.string() }),
        async execute({ value }) {
          startedTools++;
          await releaseTools.promise;
          return `${value}-result`;
        },
      }),
      failingTool: tool({
        inputSchema: z.object({ value: z.string() }),
        async execute(): Promise<string> {
          startedTools++;
          await releaseTools.promise;
          throw new Error('expected tool rejection');
        },
      }),
    },
  });

  const chunks: TextStreamPart<any>[] = [];
  const consumePromise = (async () => {
    for await (const chunk of result.stream) {
      chunks.push(chunk);
    }
  })();

  await waitFor(
    () => startedTools === 3,
    'all concurrent tools to begin executing',
  );
  releaseTools.resolve();
  await consumePromise;

  const finalToolOutputs = chunks.filter(
    chunk =>
      (chunk.type === 'tool-result' && !chunk.preliminary) ||
      chunk.type === 'tool-error',
  );
  const preliminaryOutputs = chunks.filter(
    chunk => chunk.type === 'tool-result' && chunk.preliminary,
  );

  if (finalToolOutputs.length !== 3 || preliminaryOutputs.length !== 2) {
    throw new Error(
      `Concurrent tool output mismatch: final=${finalToolOutputs.length}, preliminary=${preliminaryOutputs.length}`,
    );
  }

  return {
    finalToolOutputs: finalToolOutputs.length,
    preliminaryOutputs: preliminaryOutputs.length,
  };
}

async function runModelFailureScenario() {
  const modelError = new Error('expected model stream error');
  let sourceController!: ReadableStreamDefaultController<LanguageModelV4StreamPart>;
  let toolStarted = false;

  const result = streamText({
    model: createModel(
      new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          sourceController = controller;
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call-before-error',
            toolName: 'mustNotStart',
            input: '{}',
          });
        },
      }),
    ),
    prompt: 'Run the tool.',
    tools: {
      mustNotStart: tool({
        inputSchema: z.object({}),
        execute() {
          toolStarted = true;
          return 'unexpected';
        },
      }),
    },
  });

  const reader = result.stream.getReader();
  let observedModelError = false;

  try {
    while (true) {
      const readPromise = reader.read();
      sourceController.error(modelError);
      const { done } = await readPromise;
      if (done) {
        break;
      }
    }
  } catch (error) {
    observedModelError = error === modelError;
  }

  if (!observedModelError || toolStarted) {
    throw new Error(
      `Model failure mismatch: observedModelError=${observedModelError}, toolStarted=${toolStarted}`,
    );
  }

  return { observedModelError, toolStarted };
}

async function runCancellationAndRestartScenario() {
  const releaseTool = createDeferred<void>();
  let toolStarted = false;

  const firstResult = streamText({
    model: createModel(createToolCallStream(['delayedTool'])),
    prompt: 'Run the delayed tool.',
    tools: {
      delayedTool: tool({
        inputSchema: z.object({ value: z.string() }),
        async execute() {
          toolStarted = true;
          await releaseTool.promise;
          return 'delayed result';
        },
      }),
    },
  });

  const reader = firstResult.stream.getReader();
  const consumePromise = (async () => {
    while (!(await reader.read()).done) {
      // Consume until cancellation.
    }
  })();

  await waitFor(() => toolStarted, 'the delayed tool to begin executing');
  await reader.cancel('cancel while the tool is running');
  releaseTool.resolve();
  await consumePromise;

  const secondResult = streamText({
    model: createModel(createToolCallStream(['immediateTool'])),
    prompt: 'Run the immediate tool.',
    tools: {
      immediateTool: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: () => 'restart succeeded',
      }),
    },
  });

  const secondChunks: TextStreamPart<any>[] = [];
  for await (const chunk of secondResult.stream) {
    secondChunks.push(chunk);
  }

  const restarted = secondChunks.some(
    chunk =>
      chunk.type === 'tool-result' &&
      !chunk.preliminary &&
      chunk.output === 'restart succeeded',
  );

  if (!restarted) {
    throw new Error(
      'Cancellation/restart mismatch: second stream did not finish',
    );
  }

  return { restarted, toolStarted };
}

async function main() {
  const processErrors: string[] = [];
  const recordProcessError = (error: unknown) => {
    processErrors.push(error instanceof Error ? error.message : String(error));
  };

  process.on('unhandledRejection', recordProcessError);
  process.on('uncaughtException', recordProcessError);

  try {
    const concurrentCompletion = await runConcurrentCompletionScenario();
    const modelFailure = await runModelFailureScenario();
    const cancellationAndRestart = await runCancellationAndRestartScenario();

    await new Promise(resolve => setTimeout(resolve, 20));

    const closedStreamErrors = processErrors.filter(error =>
      /state that permits enqueue|controller is already closed|invalid state/i.test(
        error,
      ),
    );

    if (closedStreamErrors.length > 0) {
      throw new Error(
        `Reproduced issue #13683: stream controller was used after closure: ${closedStreamErrors.join('; ')}`,
      );
    }

    if (processErrors.length > 0) {
      throw new Error(
        `Unexpected process-level errors: ${processErrors.join('; ')}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          expected:
            'Concurrent, preliminary, rejected, cancelled, and model-failure tool paths must not enqueue into a closed stream.',
          concurrentCompletion,
          modelFailure,
          cancellationAndRestart,
          processErrors,
        },
        null,
        2,
      ),
    );
  } finally {
    process.off('unhandledRejection', recordProcessError);
    process.off('uncaughtException', recordProcessError);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
