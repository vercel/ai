import assert from 'node:assert/strict';
import {
  generateText,
  isStepCount,
  streamText,
  tool,
  ToolLoopAgent,
  type StepResult,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const finishReason = { unified: 'stop' as const, raw: 'stop' };
const selectedModel = { provider: 'provider-b', modelId: 'model-b' };
const reproductionSignal =
  'ISSUE_20944_REPRODUCED: streamText completed-step model metadata does not match prepareStep model';

type ModelInfo = StepResult<Record<string, never>>['model'];

function textStream({
  includeResponseMetadata,
  modelId,
}: {
  includeResponseMetadata: boolean;
  modelId: string;
}) {
  return new ReadableStream({
    start(controller) {
      if (includeResponseMetadata) {
        controller.enqueue({ type: 'response-metadata', modelId });
      }
      controller.enqueue({ type: 'text-start', id: 'text-1' });
      controller.enqueue({
        type: 'text-delta',
        id: 'text-1',
        delta: `Hello from ${modelId}.`,
      });
      controller.enqueue({ type: 'text-end', id: 'text-1' });
      controller.enqueue({ type: 'finish', finishReason, usage });
      controller.close();
    },
  });
}

function toolCallStream({
  includeResponseMetadata,
  modelId,
}: {
  includeResponseMetadata: boolean;
  modelId: string;
}) {
  return new ReadableStream({
    start(controller) {
      if (includeResponseMetadata) {
        controller.enqueue({ type: 'response-metadata', modelId });
      }
      controller.enqueue({
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'continue',
        input: '{}',
      });
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage,
      });
      controller.close();
    },
  });
}

function assertModel(actual: ModelInfo | undefined, label: string) {
  assert.deepEqual(
    actual,
    selectedModel,
    `${label} should identify the model selected by prepareStep`,
  );
}

async function runSingleStepStreamText() {
  const original = new MockLanguageModelV4({
    provider: 'provider-a',
    modelId: 'model-a',
  });
  const selected = new MockLanguageModelV4({
    ...selectedModel,
    doGenerate: {
      content: [{ type: 'text', text: 'Hello from model-b.' }],
      finishReason,
      usage,
      warnings: [],
      response: { modelId: selectedModel.modelId },
    },
    doStream: async () => ({
      stream: textStream({
        includeResponseMetadata: true,
        modelId: selectedModel.modelId,
      }),
    }),
  });

  let onStepEndModel: ModelInfo | undefined;
  let onEndModel: ModelInfo | undefined;
  const options = {
    model: original,
    prepareStep: () => ({ model: selected }),
    prompt: 'Say hello.',
  };

  const generated = await generateText(options);
  const streamed = streamText({
    ...options,
    onStepEnd: event => {
      onStepEndModel = event.model;
    },
    onEnd: event => {
      onEndModel = event.model;
    },
  });
  await streamed.consumeStream();

  assertModel(generated.steps[0]?.model, 'generateText steps[0].model');
  assert.equal(
    (await streamed.response).modelId,
    selectedModel.modelId,
    'the streamed response should identify model B',
  );
  assert.equal(
    original.doGenerateCalls.length + original.doStreamCalls.length,
    0,
    'the original model should not be called',
  );
  assert.equal(
    selected.doGenerateCalls.length + selected.doStreamCalls.length,
    2,
    'the selected model should handle generateText and streamText',
  );

  return {
    name: 'streamText first step with provider response metadata',
    models: {
      step: (await streamed.steps)[0]?.model,
      onStepEnd: onStepEndModel,
      onEnd: onEndModel,
    },
  };
}

function createTwoStepModels({
  includeResponseMetadata,
  switchStep,
}: {
  includeResponseMetadata: boolean;
  switchStep: 0 | 1;
}) {
  const original = new MockLanguageModelV4({
    provider: 'provider-a',
    modelId: 'model-a',
    doStream: async () => ({
      stream:
        switchStep === 1
          ? toolCallStream({
              includeResponseMetadata,
              modelId: 'model-a',
            })
          : textStream({
              includeResponseMetadata,
              modelId: 'model-a',
            }),
    }),
  });
  const selected = new MockLanguageModelV4({
    ...selectedModel,
    doStream: async () => ({
      stream:
        switchStep === 0
          ? toolCallStream({
              includeResponseMetadata,
              modelId: selectedModel.modelId,
            })
          : textStream({
              includeResponseMetadata,
              modelId: selectedModel.modelId,
            }),
    }),
  });

  return { original, selected };
}

const tools = {
  continue: tool({
    inputSchema: z.object({}),
    execute: async () => 'continue',
  }),
};

async function runTwoStepCase({
  api,
  includeResponseMetadata,
  switchStep,
}: {
  api: 'streamText' | 'ToolLoopAgent.stream';
  includeResponseMetadata: boolean;
  switchStep: 0 | 1;
}) {
  const { original, selected } = createTwoStepModels({
    includeResponseMetadata,
    switchStep,
  });
  const onStepEndModels: ModelInfo[] = [];
  let onEndModel: ModelInfo | undefined;
  let onEndSteps: Array<{ model: ModelInfo }> | undefined;
  const settings = {
    model: original,
    tools,
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === switchStep ? { model: selected } : undefined,
    onStepEnd: (event: { model: ModelInfo }) => {
      onStepEndModels.push(event.model);
    },
    onEnd: (event: {
      model: ModelInfo;
      steps: Array<{ model: ModelInfo }>;
    }) => {
      onEndModel = event.model;
      onEndSteps = event.steps;
    },
  };

  const result =
    api === 'streamText'
      ? streamText({ ...settings, prompt: 'Run two steps.' })
      : await new ToolLoopAgent(settings).stream({
          prompt: 'Run two steps.',
        });
  await result.consumeStream();

  const steps = await result.steps;
  assert.equal(steps.length, 2, `${api} should complete two steps`);
  assert.equal(
    original.doStreamCalls.length,
    1,
    `${api} should call the original model for only the unswitched step`,
  );
  assert.equal(
    selected.doStreamCalls.length,
    1,
    `${api} should call the selected model for the switched step`,
  );

  return {
    name: `${api} step ${switchStep + 1} ${
      includeResponseMetadata ? 'with' : 'without'
    } provider response metadata`,
    models: {
      step: steps[switchStep]?.model,
      onStepEnd: onStepEndModels[switchStep],
      onEndStep: onEndSteps?.[switchStep]?.model,
      ...(switchStep === 1 ? { onEnd: onEndModel } : {}),
    },
  };
}

async function main() {
  const cases = [
    await runSingleStepStreamText(),
    await runTwoStepCase({
      api: 'streamText',
      includeResponseMetadata: false,
      switchStep: 0,
    }),
    await runTwoStepCase({
      api: 'streamText',
      includeResponseMetadata: true,
      switchStep: 1,
    }),
    await runTwoStepCase({
      api: 'streamText',
      includeResponseMetadata: false,
      switchStep: 1,
    }),
    await runTwoStepCase({
      api: 'ToolLoopAgent.stream',
      includeResponseMetadata: true,
      switchStep: 0,
    }),
    await runTwoStepCase({
      api: 'ToolLoopAgent.stream',
      includeResponseMetadata: false,
      switchStep: 0,
    }),
    await runTwoStepCase({
      api: 'ToolLoopAgent.stream',
      includeResponseMetadata: true,
      switchStep: 1,
    }),
    await runTwoStepCase({
      api: 'ToolLoopAgent.stream',
      includeResponseMetadata: false,
      switchStep: 1,
    }),
  ];

  const mismatches = cases.flatMap(({ name, models }) =>
    Object.entries(models)
      .filter(([, model]) => {
        try {
          assertModel(model, name);
          return false;
        } catch {
          return true;
        }
      })
      .map(([field, actual]) => ({
        case: name,
        field,
        expected: selectedModel,
        actual,
      })),
  );

  console.log(JSON.stringify({ cases, mismatches }, null, 2));

  if (mismatches.length > 0) {
    throw new Error(reproductionSignal);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
