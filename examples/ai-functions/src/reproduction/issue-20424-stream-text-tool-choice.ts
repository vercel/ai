import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import {
  generateText,
  stepCountIs,
  streamText,
  tool,
  ToolChoiceViolationError,
  ToolLoopAgent,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod/v4';

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

const textOnlyStream = () =>
  convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    { type: 'text-start' as const, id: 'text-1' },
    {
      type: 'text-delta' as const,
      id: 'text-1',
      delta: 'No tool call.',
    },
    { type: 'text-end' as const, id: 'text-1' },
    {
      type: 'finish' as const,
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage,
    },
  ]);

const wrongToolStream = () =>
  convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    {
      type: 'tool-call' as const,
      toolCallId: 'call-1',
      toolName: 'other',
      input: '{}',
    },
    {
      type: 'finish' as const,
      finishReason: {
        unified: 'tool-calls' as const,
        raw: 'tool-calls',
      },
      usage,
    },
  ]);

const validToolStream = () =>
  convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    {
      type: 'tool-call' as const,
      toolCallId: 'call-1',
      toolName: 'selected',
      input: '{}',
    },
    {
      type: 'finish' as const,
      finishReason: {
        unified: 'tool-calls' as const,
        raw: 'tool-calls',
      },
      usage,
    },
  ]);

type Settled<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

async function settle<T>(promise: PromiseLike<T>): Promise<Settled<T>> {
  try {
    return { status: 'fulfilled', value: await promise };
  } catch (reason) {
    return { status: 'rejected', reason };
  }
}

function containsToolChoiceViolation(values: unknown[]): boolean {
  return values.some(value => ToolChoiceViolationError.isInstance(value));
}

function settledContainsToolChoiceViolation(result: Settled<unknown>): boolean {
  return (
    result.status === 'rejected' &&
    ToolChoiceViolationError.isInstance(result.reason)
  );
}

async function verifyGenerateTextControls() {
  const tools = {
    selected: tool({
      inputSchema: z.object({}),
      execute: async () => 'selected',
    }),
    other: tool({
      inputSchema: z.object({}),
      execute: async () => 'other',
    }),
  };

  const requiredModel = new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: 'text', text: 'No tool call.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    },
  });

  const requiredResult = await settle(
    generateText({
      model: requiredModel,
      tools,
      toolChoice: 'required',
      prompt: 'Call a tool.',
    }),
  );

  if (!settledContainsToolChoiceViolation(requiredResult)) {
    throw new Error(
      'generateText did not reject the missing required tool call with ToolChoiceViolationError',
    );
  }

  let wrongToolExecutions = 0;
  const selectedTools = {
    selected: tools.selected,
    other: tool({
      inputSchema: z.object({}),
      execute: async () => {
        wrongToolExecutions++;
        return 'other';
      },
    }),
  };
  const selectedModel = new MockLanguageModelV3({
    doGenerate: {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'other',
          input: '{}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
      usage,
      warnings: [],
    },
  });

  const selectedResult = await settle(
    generateText({
      model: selectedModel,
      tools: selectedTools,
      toolChoice: { type: 'tool', toolName: 'selected' },
      prompt: 'Call the selected tool.',
    }),
  );

  if (
    !settledContainsToolChoiceViolation(selectedResult) ||
    wrongToolExecutions !== 0
  ) {
    throw new Error(
      'generateText did not reject the selected-tool violation before tool execution',
    );
  }
}

async function verifyValidStreamControl() {
  const errors: unknown[] = [];
  let onFinishCalls = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => ({ stream: validToolStream() }),
  });

  const result = streamText({
    model,
    tools: {
      selected: tool({ inputSchema: z.object({}) }),
    },
    toolChoice: 'required',
    prompt: 'Call a tool.',
    onError: ({ error }) => {
      errors.push(error);
    },
    onFinish: () => {
      onFinishCalls++;
    },
  });

  await result.consumeStream();
  const finishReason = await result.finishReason;

  if (
    finishReason !== 'tool-calls' ||
    errors.length !== 0 ||
    onFinishCalls !== 1 ||
    model.doStreamCalls.length !== 1
  ) {
    throw new Error(
      'the valid required-tool stream control did not complete normally',
    );
  }
}

async function probeRequiredTextViolation() {
  const errors: unknown[] = [];
  let onFinishCalls = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => ({ stream: textOnlyStream() }),
  });

  const result = streamText({
    model,
    tools: {
      selected: tool({ inputSchema: z.object({}) }),
    },
    toolChoice: 'required',
    prompt: 'Call a tool.',
    onError: ({ error }) => {
      errors.push(error);
    },
    onFinish: () => {
      onFinishCalls++;
    },
  });

  await result.consumeStream({
    onError: error => errors.push(error),
  });

  const finishReason = await settle(result.finishReason);
  const text = await settle(result.text);

  return {
    violationSurfaced:
      containsToolChoiceViolation(errors) ||
      settledContainsToolChoiceViolation(finishReason) ||
      settledContainsToolChoiceViolation(text),
    finishReason,
    text,
    onFinishCalls,
    providerCalls: model.doStreamCalls.length,
  };
}

async function probeSelectedToolViolation(options: {
  usePrepareStep: boolean;
}) {
  const errors: unknown[] = [];
  let onFinishCalls = 0;
  let wrongToolExecutions = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => ({ stream: wrongToolStream() }),
  });

  const result = streamText({
    model,
    tools: {
      selected: tool({
        inputSchema: z.object({}),
        execute: async () => 'selected',
      }),
      other: tool({
        inputSchema: z.object({}),
        execute: async () => {
          wrongToolExecutions++;
          return 'other';
        },
      }),
    },
    toolChoice: options.usePrepareStep
      ? 'auto'
      : { type: 'tool', toolName: 'selected' },
    prepareStep: options.usePrepareStep
      ? async () => ({
          toolChoice: { type: 'tool' as const, toolName: 'selected' as const },
        })
      : undefined,
    prompt: 'Call the selected tool.',
    onError: ({ error }) => {
      errors.push(error);
    },
    onFinish: () => {
      onFinishCalls++;
    },
  });

  await result.consumeStream({
    onError: error => errors.push(error),
  });

  const finishReason = await settle(result.finishReason);

  return {
    violationSurfaced:
      containsToolChoiceViolation(errors) ||
      settledContainsToolChoiceViolation(finishReason),
    finishReason,
    wrongToolExecutions,
    onFinishCalls,
    providerCalls: model.doStreamCalls.length,
  };
}

async function probeAgentSelectedToolViolation(options: {
  usePrepareStep: boolean;
}) {
  let wrongToolExecutions = 0;
  let onFinishCalls = 0;
  const model = new MockLanguageModelV3({
    doStream: async () => ({ stream: wrongToolStream() }),
  });

  const agent = new ToolLoopAgent({
    model,
    tools: {
      selected: tool({
        inputSchema: z.object({}),
        execute: async () => 'selected',
      }),
      other: tool({
        inputSchema: z.object({}),
        execute: async () => {
          wrongToolExecutions++;
          return 'other';
        },
      }),
    },
    toolChoice: options.usePrepareStep
      ? 'auto'
      : { type: 'tool', toolName: 'selected' },
    prepareStep: options.usePrepareStep
      ? async () => ({
          toolChoice: { type: 'tool' as const, toolName: 'selected' as const },
        })
      : undefined,
    stopWhen: stepCountIs(1),
    onFinish: () => {
      onFinishCalls++;
    },
  });

  const result = await agent.stream({
    prompt: 'Call the selected tool.',
  });
  const streamErrors: unknown[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      streamErrors.push(part.error);
    }
  }

  const finishReason = await settle(result.finishReason);

  return {
    violationSurfaced:
      containsToolChoiceViolation(streamErrors) ||
      settledContainsToolChoiceViolation(finishReason),
    finishReason,
    wrongToolExecutions,
    onFinishCalls,
    providerCalls: model.doStreamCalls.length,
  };
}

async function main() {
  try {
    await verifyGenerateTextControls();
    await verifyValidStreamControl();
  } catch (error) {
    console.error(
      `REPRO_SETUP_FAILURE: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 2;
    return;
  }

  const requiredText = await probeRequiredTextViolation();
  const selectedTool = await probeSelectedToolViolation({
    usePrepareStep: false,
  });
  const selectedToolFromPrepareStep = await probeSelectedToolViolation({
    usePrepareStep: true,
  });
  const agentSelectedTool = await probeAgentSelectedToolViolation({
    usePrepareStep: false,
  });
  const agentSelectedToolFromPrepareStep =
    await probeAgentSelectedToolViolation({
      usePrepareStep: true,
    });

  const violations = {
    requiredTextNotRejected:
      !requiredText.violationSurfaced ||
      (requiredText.finishReason.status === 'fulfilled' &&
        requiredText.finishReason.value === 'stop') ||
      requiredText.providerCalls !== 1,
    selectedToolViolationNotSafelyRejected:
      !selectedTool.violationSurfaced ||
      selectedTool.wrongToolExecutions !== 0 ||
      (selectedTool.finishReason.status === 'fulfilled' &&
        selectedTool.finishReason.value === 'tool-calls') ||
      selectedTool.providerCalls !== 1,
    prepareStepSelectedToolViolationNotSafelyRejected:
      !selectedToolFromPrepareStep.violationSurfaced ||
      selectedToolFromPrepareStep.wrongToolExecutions !== 0 ||
      (selectedToolFromPrepareStep.finishReason.status === 'fulfilled' &&
        selectedToolFromPrepareStep.finishReason.value === 'tool-calls') ||
      selectedToolFromPrepareStep.providerCalls !== 1,
    agentSelectedToolViolationNotSafelyRejected:
      !agentSelectedTool.violationSurfaced ||
      agentSelectedTool.wrongToolExecutions !== 0 ||
      (agentSelectedTool.finishReason.status === 'fulfilled' &&
        agentSelectedTool.finishReason.value === 'tool-calls') ||
      agentSelectedTool.providerCalls !== 1,
    agentPrepareStepSelectedToolViolationNotSafelyRejected:
      !agentSelectedToolFromPrepareStep.violationSurfaced ||
      agentSelectedToolFromPrepareStep.wrongToolExecutions !== 0 ||
      (agentSelectedToolFromPrepareStep.finishReason.status === 'fulfilled' &&
        agentSelectedToolFromPrepareStep.finishReason.value === 'tool-calls') ||
      agentSelectedToolFromPrepareStep.providerCalls !== 1,
  };

  console.log(
    JSON.stringify(
      {
        requiredText,
        selectedTool,
        selectedToolFromPrepareStep,
        agentSelectedTool,
        agentSelectedToolFromPrepareStep,
        violations,
      },
      null,
      2,
    ),
  );

  if (Object.values(violations).some(Boolean)) {
    console.error(
      'ISSUE_20424_REPRODUCED: streamText accepted an enforced tool-choice violation or executed a disallowed tool',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(
    `REPRO_SETUP_FAILURE: ${error instanceof Error ? error.stack : String(error)}`,
  );
  process.exitCode = 2;
});
