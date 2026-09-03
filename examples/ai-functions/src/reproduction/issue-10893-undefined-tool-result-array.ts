import assert from 'node:assert/strict';
import {
  generateText,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV2 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
};

const listTasks = tool({
  description: 'List tasks',
  inputSchema: z.object({
    limit: z.number().optional(),
  }),
  execute: async () => [
    {
      id: '1',
      state: 'completed',
      startedAt: '2025-10-26T17:59:40.065Z',
      completedAt: '2025-10-26T18:00:31.713Z',
    },
    {
      id: '2',
      state: 'archived',
      startedAt: undefined,
      completedAt: undefined,
    },
  ],
});

function createToolCallStreamModel() {
  return new MockLanguageModelV2({
    doStream: {
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'listTasks',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          usage,
        },
      ]),
    },
  });
}

function createTextStreamModel() {
  return new MockLanguageModelV2({
    doStream: {
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'Continuation succeeded.',
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage,
        },
      ]),
    },
  });
}

function createTextGenerateModel() {
  return new MockLanguageModelV2({
    doGenerate: {
      content: [{ type: 'text', text: 'Continuation succeeded.' }],
      finishReason: 'stop',
      usage,
      warnings: [],
    },
  });
}

async function createMessagesWithUndefinedToolOutput(): Promise<
  ModelMessage[]
> {
  const firstResult = streamText({
    model: createToolCallStreamModel(),
    messages: [{ role: 'user', content: 'List all tasks.' }],
    tools: { listTasks },
    maxRetries: 0,
  });

  await firstResult.consumeStream();

  return [
    { role: 'user', content: 'List all tasks.' },
    ...(await firstResult.response).messages,
  ];
}

function getSecondTask(messages: ModelMessage[]): Record<string, unknown> {
  const toolMessage = messages.find(message => message.role === 'tool');
  assert.ok(toolMessage, 'Expected a tool response message.');

  const toolResult = toolMessage.content.find(
    part => part.type === 'tool-result',
  );
  assert.ok(toolResult, 'Expected a tool-result content part.');
  assert.equal(toolResult.output.type, 'json');
  assert.ok(Array.isArray(toolResult.output.value));

  const secondTask = toolResult.output.value[1];
  assert.ok(
    secondTask != null &&
      typeof secondTask === 'object' &&
      !Array.isArray(secondTask),
  );

  return secondTask;
}

async function runStreamContinuation(messages: ModelMessage[]) {
  let streamError: unknown;
  const result = streamText({
    model: createTextStreamModel(),
    messages,
    tools: { listTasks },
    maxRetries: 0,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  await result.consumeStream();

  const outcomes = await Promise.allSettled([
    result.text,
    result.response,
    result.finishReason,
    result.usage,
    result.steps,
  ]);
  if (streamError != null) {
    throw streamError;
  }

  const rejection = outcomes.find(outcome => outcome.status === 'rejected');
  if (rejection?.status === 'rejected') {
    throw rejection.reason;
  }

  const text = outcomes[0];
  assert.equal(text.status, 'fulfilled');
  assert.equal(text.value, 'Continuation succeeded.');
}

async function runGenerateContinuation(messages: ModelMessage[]) {
  const result = await generateText({
    model: createTextGenerateModel(),
    messages,
    tools: { listTasks },
    maxRetries: 0,
  });

  assert.equal(result.text, 'Continuation succeeded.');
}

function isReportedValidationFailure(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const cause = candidate.cause;
  const causeName =
    cause != null && typeof cause === 'object' && 'name' in cause
      ? cause.name
      : undefined;

  return (
    candidate.name === 'AI_InvalidPromptError' &&
    typeof candidate.message === 'string' &&
    candidate.message.includes('The messages must be a ModelMessage[]') &&
    causeName === 'AI_TypeValidationError'
  );
}

async function captureReportedFailure(
  operation: () => Promise<void>,
): Promise<boolean> {
  try {
    await operation();
    return false;
  } catch (error) {
    if (!isReportedValidationFailure(error)) {
      throw error;
    }
    return true;
  }
}

async function verifyAutomaticMultiStepStillWorks() {
  const model = new MockLanguageModelV2({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-automatic',
            toolName: 'listTasks',
            input: '{}',
          },
        ],
        finishReason: 'tool-calls',
        usage,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'Automatic continuation succeeded.' }],
        finishReason: 'stop',
        usage,
        warnings: [],
      },
    ],
  });

  const result = await generateText({
    model,
    prompt: 'List all tasks.',
    tools: { listTasks },
    stopWhen: stepCountIs(2),
    maxRetries: 0,
  });

  assert.equal(result.text, 'Automatic continuation succeeded.');
}

async function main() {
  const messages = await createMessagesWithUndefinedToolOutput();
  const secondTask = getSecondTask(messages);
  const retainedUndefinedProperties =
    Object.hasOwn(secondTask, 'startedAt') &&
    Object.hasOwn(secondTask, 'completedAt') &&
    secondTask.startedAt === undefined &&
    secondTask.completedAt === undefined;

  const serializedMessages = JSON.parse(
    JSON.stringify(messages),
  ) as ModelMessage[];
  const serializedSecondTask = getSecondTask(serializedMessages);
  if (retainedUndefinedProperties) {
    assert.ok(!Object.hasOwn(serializedSecondTask, 'startedAt'));
    assert.ok(!Object.hasOwn(serializedSecondTask, 'completedAt'));
  }
  await runStreamContinuation(serializedMessages);
  await runGenerateContinuation(serializedMessages);

  const nullMessages = structuredClone(messages);
  const nullSecondTask = getSecondTask(nullMessages);
  nullSecondTask.startedAt = null;
  nullSecondTask.completedAt = null;
  await runStreamContinuation(nullMessages);
  await runGenerateContinuation(nullMessages);

  await verifyAutomaticMultiStepStillWorks();

  const streamRejected = await captureReportedFailure(() =>
    runStreamContinuation(messages),
  );
  const generateRejected = await captureReportedFailure(() =>
    runGenerateContinuation(messages),
  );

  if (streamRejected || generateRejected) {
    throw new Error(
      'ISSUE_10893_REPRODUCED: manual follow-up rejected valid tool-result messages with nested undefined properties ' +
        `(streamText=${streamRejected}, generateText=${generateRejected}, ` +
        `retainedUndefined=${retainedUndefinedProperties})`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
