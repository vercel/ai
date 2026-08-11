import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';

type WorkflowAgentConstructor = new (options: Record<string, unknown>) => {
  stream(options: Record<string, unknown>): Promise<unknown>;
};

function createFinishStream(): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
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
      });
      controller.close();
    },
  });
}

function createMockModel() {
  const calls: LanguageModelV4CallOptions[] = [];

  const model: LanguageModelV4 = {
    specificationVersion: 'v4',
    provider: 'issue-18576',
    modelId: 'mock-model',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('Unexpected doGenerate call');
    },
    doStream: async options => {
      calls.push(options);
      return { stream: createFinishStream() };
    },
  };

  return { calls, model };
}

function createWritable() {
  return new WritableStream({ write() {} });
}

async function runTemperatureControl(WorkflowAgent: WorkflowAgentConstructor) {
  const { calls, model } = createMockModel();
  const agent = new WorkflowAgent({
    model,
    prepareCall: () => ({ temperature: 0.9 }),
  });

  await agent.stream({
    messages: [{ role: 'user', content: 'temperature control' }],
    writable: createWritable(),
  });

  return calls[0]?.temperature;
}

async function runMaxRetriesCheck(WorkflowAgent: WorkflowAgentConstructor) {
  const { model } = createMockModel();
  let observedMaxRetries: number | undefined;

  const agent = new WorkflowAgent({
    model,
    maxRetries: 1,
    prepareCall: () => ({ maxRetries: 5 }),
    telemetry: {
      integrations: {
        onStart(event: { maxRetries?: number }) {
          observedMaxRetries = event.maxRetries;
        },
      },
    },
  });

  await agent.stream({
    messages: [{ role: 'user', content: 'max retries check' }],
    writable: createWritable(),
  });

  return observedMaxRetries;
}

async function runAbortSignalCheck(WorkflowAgent: WorkflowAgentConstructor) {
  const { calls, model } = createMockModel();
  const controller = new AbortController();
  controller.abort();
  let onAbortCalls = 0;

  const agent = new WorkflowAgent({
    model,
    prepareCall: () => ({ abortSignal: controller.signal }),
  });

  await agent.stream({
    messages: [{ role: 'user', content: 'abort signal check' }],
    writable: createWritable(),
    onAbort: () => {
      onAbortCalls++;
    },
  });

  return { modelCalls: calls.length, onAbortCalls };
}

async function main() {
  const workflowModuleUrl = new URL(
    '../../../../packages/workflow/src/index.ts',
    import.meta.url,
  ).href;
  const { WorkflowAgent } = (await import(workflowModuleUrl)) as {
    WorkflowAgent: WorkflowAgentConstructor;
  };

  const temperature = await runTemperatureControl(WorkflowAgent);
  if (temperature !== 0.9) {
    throw new Error(
      `Reproduction harness failed: temperature control was ${String(temperature)}, expected 0.9`,
    );
  }

  const maxRetries = await runMaxRetriesCheck(WorkflowAgent);
  const abort = await runAbortSignalCheck(WorkflowAgent);

  const maxRetriesIgnored = maxRetries === 1;
  const abortSignalIgnored = abort.modelCalls === 1 && abort.onAbortCalls === 0;

  if (maxRetriesIgnored && abortSignalIgnored) {
    console.error(
      'ISSUE_18576_REPRODUCED: prepareCall maxRetries and abortSignal were ignored',
    );
    console.error(
      JSON.stringify({
        control: { expectedTemperature: 0.9, observedTemperature: temperature },
        maxRetries: { expected: 5, observed: maxRetries },
        abortSignal: {
          expectedModelCalls: 0,
          observedModelCalls: abort.modelCalls,
          expectedOnAbortCalls: 1,
          observedOnAbortCalls: abort.onAbortCalls,
        },
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (maxRetries !== 5 || abort.modelCalls !== 0 || abort.onAbortCalls !== 1) {
    throw new Error(
      `Unexpected partial result: ${JSON.stringify({ maxRetries, abort })}`,
    );
  }

  console.log(
    'Issue #18576 is fixed: prepareCall maxRetries and abortSignal were applied.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
