import { setImmediate as waitForImmediate } from 'node:timers/promises';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4ToolCall,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  generateText,
  streamText,
  tool,
  ToolLoopAgent,
  type StreamTextResult,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

type Api = 'generateText' | 'streamText' | 'ToolLoopAgent.stream';
type Cancellation = 'caller abort' | 'timeout.totalMs';

type Observation = {
  api: Api;
  cancellation: Cancellation;
  settledBeforeRepair: boolean;
  toolExecutions: number;
  toolExecutionAbortStates: boolean[];
  terminalErrorName: string | undefined;
  unexpectedTerminalError: boolean;
};

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const toolCall = {
  type: 'tool-call' as const,
  toolCallId: 'call-1',
  toolName: 'example',
  input: '{"value":"invalid"}',
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createGenerateModel() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [toolCall],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage,
      warnings: [],
    },
  });
}

function createStreamModel() {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    toolCall,
    {
      type: 'finish',
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage,
    },
  ];

  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      }),
    }),
  });
}

async function consume(result: StreamTextResult<any, any, any>) {
  await result.text;
}

async function runScenario({
  api,
  cancellation,
}: {
  api: Api;
  cancellation: Cancellation;
}): Promise<Observation> {
  const controller = new AbortController();
  const repairStarted = createDeferred<void>();
  const pendingRepair = createDeferred<void>();
  let settled = false;
  let terminalErrorName: string | undefined;
  let unexpectedTerminalError = false;
  let toolExecutions = 0;
  const toolExecutionAbortStates: boolean[] = [];

  const tools = {
    example: tool({
      inputSchema: z.object({ value: z.number() }),
      execute: async (_input, { abortSignal }) => {
        toolExecutions++;
        toolExecutionAbortStates.push(abortSignal?.aborted ?? false);
        return 'executed';
      },
    }),
  };

  const commonOptions = {
    prompt: 'Run the example tool.',
    abortSignal:
      cancellation === 'caller abort' ? controller.signal : undefined,
    timeout: cancellation === 'timeout.totalMs' ? { totalMs: 25 } : undefined,
    tools,
    repairToolCall: async ({
      toolCall: originalToolCall,
    }: {
      toolCall: LanguageModelV4ToolCall;
    }) => {
      repairStarted.resolve();
      await pendingRepair.promise;
      return { ...originalToolCall, input: '{"value":1}' };
    },
  };

  let operation: Promise<unknown>;

  if (api === 'generateText') {
    operation = generateText({
      ...commonOptions,
      model: createGenerateModel(),
    });
  } else if (api === 'streamText') {
    operation = consume(
      streamText({
        ...commonOptions,
        model: createStreamModel(),
      }),
    );
  } else {
    const agent = new ToolLoopAgent({
      model: createStreamModel(),
      tools,
      repairToolCall: commonOptions.repairToolCall,
    });
    operation = agent
      .stream({
        prompt: commonOptions.prompt,
        abortSignal: commonOptions.abortSignal,
        timeout: commonOptions.timeout,
      })
      .then(consume);
  }

  const completion = operation
    .catch(error => {
      terminalErrorName =
        error != null && typeof error === 'object' && 'name' in error
          ? String(error.name)
          : undefined;
      unexpectedTerminalError =
        terminalErrorName !== 'AbortError' &&
        terminalErrorName !== 'TimeoutError';
    })
    .finally(() => {
      settled = true;
    });

  await repairStarted.promise;

  if (cancellation === 'caller abort') {
    controller.abort();
    await waitForImmediate();
    await waitForImmediate();
  } else {
    await new Promise(resolve => setTimeout(resolve, 75));
  }

  const settledBeforeRepair = settled;

  pendingRepair.resolve();
  await completion;
  await waitForImmediate();
  await waitForImmediate();

  return {
    api,
    cancellation,
    settledBeforeRepair,
    toolExecutions,
    toolExecutionAbortStates,
    terminalErrorName,
    unexpectedTerminalError,
  };
}

async function main() {
  const observations: Observation[] = [];

  for (const api of [
    'generateText',
    'streamText',
    'ToolLoopAgent.stream',
  ] as const) {
    for (const cancellation of ['caller abort', 'timeout.totalMs'] as const) {
      observations.push(await runScenario({ api, cancellation }));
    }
  }

  console.log(JSON.stringify(observations, null, 2));

  const failures = observations.filter(
    observation =>
      !observation.settledBeforeRepair ||
      observation.toolExecutions !== 0 ||
      observation.unexpectedTerminalError,
  );

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_20938_REPRODUCED: cancellation waited for repair and executed its late result in ${failures.length} scenario(s)`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
