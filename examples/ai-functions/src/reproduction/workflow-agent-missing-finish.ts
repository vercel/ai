import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { jsonSchema, tool, ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const noOutputErrorMessage =
  'No output generated. The model stream ended without a finish chunk.';
const bugSignal =
  'BUG: WorkflowAgent resolved incomplete no-output stream(s) without NoOutputGeneratedError';

const finish = (reason: 'stop' | 'tool-calls'): LanguageModelV4StreamPart => ({
  type: 'finish',
  finishReason: { unified: reason, raw: reason },
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
      reasoning: 0,
    },
  },
});

function scriptedModel(streams: LanguageModelV4StreamPart[][]) {
  let call = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      const parts = streams[Math.min(call++, streams.length - 1)];

      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) {
              controller.enqueue(part);
            }
            controller.close();
          },
        }),
      };
    },
  });
}

const tools = {
  lookup: tool({
    inputSchema: jsonSchema<{ q: string }>({
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
      additionalProperties: false,
    }),
    execute: async ({ q }) => `result for ${q}`,
  }),
};

const toolRound: LanguageModelV4StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  {
    type: 'tool-call',
    toolCallId: 'call-1',
    toolName: 'lookup',
    input: '{"q":"a"}',
  },
  finish('tool-calls'),
];

const incompleteStreams = {
  'after-tool-response-metadata': [
    { type: 'stream-start', warnings: [] },
    { type: 'response-metadata', id: 'resp-2', modelId: 'mock' },
  ],
  'stream-start-only': [{ type: 'stream-start', warnings: [] }],
  'bare-text-start': [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
  ],
  'empty-encrypted-reasoning-delta': [
    { type: 'stream-start', warnings: [] },
    {
      type: 'reasoning-start',
      id: 'reasoning-1',
      providerMetadata: {
        openai: { reasoningEncryptedContent: 'encrypted-reasoning' },
      },
    },
    {
      type: 'reasoning-delta',
      id: 'reasoning-1',
      delta: '',
      providerMetadata: {
        openai: { reasoningEncryptedContent: 'encrypted-reasoning' },
      },
    },
  ],
} satisfies Record<string, LanguageModelV4StreamPart[]>;

function isNoOutputError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'AI_NoOutputGeneratedError' &&
    error.message === noOutputErrorMessage
  );
}

async function consumeControl(streams: LanguageModelV4StreamPart[][]) {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const control = await new ToolLoopAgent({
      model: scriptedModel(streams),
      tools,
    }).stream({
      prompt: 'Do the task.',
    });

    for await (const _ of control.fullStream) {
      // Consume the stream so terminal promises settle.
    }

    return control.finishReason.then(
      () => undefined,
      error => error,
    );
  } finally {
    console.error = originalConsoleError;
  }
}

async function runWorkflow(streams: LanguageModelV4StreamPart[][]) {
  const chunks: string[] = [];
  const onErrorValues: unknown[] = [];
  const onEndFinishReasons: string[] = [];

  const result = await new WorkflowAgent({
    model: scriptedModel(streams),
    tools,
  }).stream({
    prompt: 'Do the task.',
    writable: new WritableStream({
      write: chunk => {
        chunks.push(chunk.type);
      },
    }),
    onError: ({ error }) => {
      onErrorValues.push(error);
    },
    onEnd: ({ finishReason }) => {
      onEndFinishReasons.push(finishReason);
    },
  });

  return { result, chunks, onErrorValues, onEndFinishReasons };
}

function requireHarness(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`REPRO HARNESS FAILURE: ${message}`);
  }
}

async function main() {
  const failures: string[] = [];
  const observations: Record<string, unknown> = {};

  for (const [name, incompleteStream] of Object.entries(incompleteStreams)) {
    const streams =
      name === 'after-tool-response-metadata'
        ? [toolRound, incompleteStream]
        : [incompleteStream];

    const controlError = await consumeControl(streams);
    requireHarness(
      isNoOutputError(controlError),
      `ToolLoopAgent control did not reject ${name} with ${noOutputErrorMessage}`,
    );

    const workflow = await runWorkflow(streams);
    const hasError = 'error' in workflow.result;
    const workflowError = hasError ? workflow.result.error : undefined;

    observations[name] = {
      controlError:
        controlError instanceof Error
          ? { name: controlError.name, message: controlError.message }
          : controlError,
      workflow: {
        finishReason: workflow.result.finishReason,
        hasError,
        error:
          workflowError instanceof Error
            ? { name: workflowError.name, message: workflowError.message }
            : workflowError,
        steps: workflow.result.steps.length,
        lastStepText: workflow.result.steps.at(-1)?.text,
        lastStepUsage: workflow.result.steps.at(-1)?.usage,
        lastChunksWritten: workflow.chunks.slice(-4),
        onErrorCalls: workflow.onErrorValues.length,
        onEndFinishReasons: workflow.onEndFinishReasons,
      },
    };

    if (!hasError || !isNoOutputError(workflowError)) {
      failures.push(name);
      continue;
    }

    requireHarness(
      workflow.onErrorValues.length === 1 &&
        workflow.onErrorValues[0] === workflowError,
      `WorkflowAgent did not call onError exactly once with result.error for ${name}`,
    );
  }

  const partialOutputStream: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'partial output' },
  ];
  const partialControlError = await consumeControl([partialOutputStream]);
  const partialWorkflow = await runWorkflow([partialOutputStream]);
  requireHarness(
    partialControlError === undefined,
    'ToolLoopAgent rejected an incomplete stream that contained partial output',
  );
  requireHarness(
    !('error' in partialWorkflow.result) &&
      partialWorkflow.result.steps.at(-1)?.text === 'partial output',
    'WorkflowAgent did not retain an incomplete stream that contained partial output',
  );
  observations['partial-output-without-finish'] = {
    controlError: partialControlError,
    workflow: {
      finishReason: partialWorkflow.result.finishReason,
      hasError: 'error' in partialWorkflow.result,
      lastStepText: partialWorkflow.result.steps.at(-1)?.text,
    },
  };

  console.log(JSON.stringify(observations, null, 2));

  if (failures.length > 0) {
    console.error(`${bugSignal}: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
