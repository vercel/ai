import assert from 'node:assert/strict';
import {
  generateText,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
} from '../../../../packages/ai/dist/index.mjs';
import {
  convertArrayToReadableStream,
  MockLanguageModelV2,
} from '../../../../packages/ai/dist/test/index.mjs';

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
};

const listTasks = tool({
  description: 'List tasks',
  inputSchema: jsonSchema<{ limit?: number }>({
    type: 'object',
    properties: {
      limit: { type: 'number' },
    },
    additionalProperties: false,
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

function toolCallStream() {
  return convertArrayToReadableStream([
    {
      type: 'tool-call' as const,
      toolCallId: 'call-1',
      toolName: 'listTasks',
      input: '{}',
    },
    {
      type: 'finish' as const,
      finishReason: 'tool-calls' as const,
      usage,
    },
  ]);
}

function textStream(text = 'follow-up accepted') {
  return convertArrayToReadableStream([
    { type: 'text-start' as const, id: 'text-1' },
    { type: 'text-delta' as const, id: 'text-1', delta: text },
    { type: 'text-end' as const, id: 'text-1' },
    {
      type: 'finish' as const,
      finishReason: 'stop' as const,
      usage,
    },
  ]);
}

async function consumeText(result: {
  textStream: AsyncIterable<string>;
}): Promise<string> {
  let text = '';
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  return text;
}

async function captureError(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error;
  }
}

function assertInvalidPrompt(error: unknown, api: string): void {
  assert.ok(
    error instanceof Error,
    `${api} unexpectedly accepted the messages`,
  );
  assert.equal(error.name, 'AI_InvalidPromptError');
  assert.match(error.message, /The messages must be a ModelMessage\[\]/);

  const cause = (error as Error & { cause?: unknown }).cause;
  assert.ok(cause instanceof Error);
  assert.equal(cause.name, 'AI_TypeValidationError');
}

async function main() {
  const firstResult = streamText({
    model: new MockLanguageModelV2({
      doStream: async () => ({ stream: toolCallStream() }),
    }),
    messages: [{ role: 'user', content: 'List all the tasks' }],
    tools: { listTasks },
  });

  await firstResult.consumeStream();
  const responseMessages = (await firstResult.response).messages;
  const toolMessage = responseMessages.find(message => message.role === 'tool');
  assert.ok(toolMessage);
  const output = toolMessage.content[0].output;
  assert.equal(output.type, 'json');

  const tasks = output.value as unknown as Array<{
    startedAt?: string;
    completedAt?: string;
  }>;
  assert.equal(Object.hasOwn(tasks[1], 'startedAt'), true);
  assert.equal(tasks[1].startedAt, undefined);

  const followUpModel = new MockLanguageModelV2({
    doStream: async () => ({ stream: textStream() }),
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'follow-up accepted' }],
      finishReason: 'stop',
      usage,
      warnings: [],
    }),
  });
  const directMessages = [
    { role: 'user' as const, content: 'List all the tasks' },
    ...responseMessages,
  ];

  let streamError: unknown;
  const directText = await consumeText(
    streamText({
      model: followUpModel,
      messages: directMessages,
      tools: { listTasks },
      onError: event => {
        streamError = event.error;
      },
    }),
  );
  assert.equal(directText, '');
  assertInvalidPrompt(streamError, 'streamText');

  const generateError = await captureError(() =>
    generateText({
      model: followUpModel,
      messages: directMessages,
      tools: { listTasks },
    }),
  );
  assertInvalidPrompt(generateError, 'generateText');

  const serializedMessages = JSON.parse(
    JSON.stringify(directMessages),
  ) as typeof directMessages;
  const serializedText = await consumeText(
    streamText({
      model: followUpModel,
      messages: serializedMessages,
      tools: { listTasks },
    }),
  );
  assert.equal(serializedText, 'follow-up accepted');

  const nullMessages = structuredClone(directMessages);
  const nullToolMessage = nullMessages.find(message => message.role === 'tool');
  assert.ok(nullToolMessage);
  const nullOutput = nullToolMessage.content[0].output;
  assert.equal(nullOutput.type, 'json');
  const nullTasks = nullOutput.value as unknown as Array<{
    startedAt: string | null;
    completedAt: string | null;
  }>;
  nullTasks[1].startedAt = null;
  nullTasks[1].completedAt = null;
  const nullText = await consumeText(
    streamText({
      model: followUpModel,
      messages: nullMessages,
      tools: { listTasks },
    }),
  );
  assert.equal(nullText, 'follow-up accepted');

  let multiStepCall = 0;
  const multiStepText = await consumeText(
    streamText({
      model: new MockLanguageModelV2({
        doStream: async () => ({
          stream: multiStepCall++ === 0 ? toolCallStream() : textStream(),
        }),
      }),
      prompt: 'List all the tasks',
      tools: { listTasks },
      stopWhen: stepCountIs(2),
    }),
  );
  assert.equal(multiStepText, 'follow-up accepted');

  console.error(
    'ISSUE_10893_REPRODUCED: follow-up streamText and generateText calls rejected direct response messages with AI_InvalidPromptError',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
