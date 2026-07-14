import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

type ScenarioResult = {
  consumerErrors: string[];
  toolCompletions: string[];
  toolStarts: string[];
};

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runScenario({
  errorAfterBothToolsStart,
  name,
}: {
  errorAfterBothToolsStart: boolean;
  name: string;
}): Promise<ScenarioResult> {
  const consumerErrors: string[] = [];
  const toolCompletions: string[] = [];
  const toolStarts: string[] = [];
  let modelStreamController:
    | ReadableStreamDefaultController<LanguageModelV3StreamPart>
    | undefined;

  const model = new MockLanguageModelV3({
    provider: 'mock',
    modelId: `issue-12874-${name}`,
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          modelStreamController = controller;
          controller.enqueue({
            type: 'response-metadata',
            id: 'resp-1',
            modelId: 'mock',
            timestamp: new Date(),
          });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'slowToolA',
            input: '{"q":"a"}',
          });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'slowToolB',
            input: '{"q":"b"}',
          });

          if (!errorAfterBothToolsStart) {
            setTimeout(() => {
              controller.error(new Error('simulated LLM stream error'));
            }, 50);
          }
        },
      }),
    }),
  });

  let modelErrorScheduled = false;
  const executeTool = (toolName: string, delayMs: number) => async () => {
    toolStarts.push(toolName);

    if (
      errorAfterBothToolsStart &&
      toolStarts.length === 2 &&
      !modelErrorScheduled
    ) {
      modelErrorScheduled = true;
      setTimeout(() => {
        modelStreamController?.error(
          new Error('simulated LLM stream error after both tools started'),
        );
      }, 0);
    }

    await sleep(delayMs);
    toolCompletions.push(toolName);
    return { ok: true };
  };

  const result = streamText({
    model,
    messages: [{ role: 'user', content: 'test' }],
    tools: {
      slowToolA: tool({
        description: 'Slow tool A',
        inputSchema: z.object({ q: z.string() }),
        execute: executeTool('slowToolA', 200),
      }),
      slowToolB: tool({
        description: 'Slow tool B',
        inputSchema: z.object({ q: z.string() }),
        execute: executeTool('slowToolB', 300),
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(10),
    onError: ({ error }) => {
      consumerErrors.push(errorMessage(error));
    },
  });

  try {
    for await (const _ of result.fullStream) {
      // Consume the stream so cancellation and error propagation run.
    }
  } catch (error) {
    consumerErrors.push(errorMessage(error));
  }

  await sleep(500);

  return { consumerErrors, toolCompletions, toolStarts };
}

async function main() {
  const processErrors: string[] = [];
  const onUnhandledRejection = (error: unknown) => {
    processErrors.push(`unhandledRejection: ${errorMessage(error)}`);
  };
  const onUncaughtException = (error: Error) => {
    processErrors.push(`uncaughtException: ${errorMessage(error)}`);
  };

  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  const reportedShape = await runScenario({
    name: 'reported-shape',
    errorAfterBothToolsStart: false,
  });
  const toolsDefinitelyRunning = await runScenario({
    name: 'tools-definitely-running',
    errorAfterBothToolsStart: true,
  });

  process.off('unhandledRejection', onUnhandledRejection);
  process.off('uncaughtException', onUncaughtException);

  console.log(
    JSON.stringify(
      { processErrors, reportedShape, toolsDefinitelyRunning },
      null,
      2,
    ),
  );

  const controllerClosedErrors = processErrors.filter(error =>
    error.includes('Controller is already closed'),
  );

  if (controllerClosedErrors.length > 0) {
    throw new Error(
      `Issue #12874 reproduced: ${controllerClosedErrors.join('; ')}`,
    );
  }

  if (toolsDefinitelyRunning.toolStarts.length !== 2) {
    throw new Error(
      `Narrowing scenario did not start both tools: ${toolsDefinitelyRunning.toolStarts.join(', ')}`,
    );
  }

  if (toolsDefinitelyRunning.toolCompletions.length !== 2) {
    throw new Error(
      `Narrowing scenario did not complete both tools: ${toolsDefinitelyRunning.toolCompletions.join(', ')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
