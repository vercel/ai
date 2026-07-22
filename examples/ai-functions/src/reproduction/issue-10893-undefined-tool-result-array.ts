import { type ModelMessage, streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const usage = {
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

function createToolCallModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'listTasks',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: { raw: undefined, unified: 'tool-calls' },
          usage,
        },
      ]),
    }),
  });
}

function createTextModel(text: string) {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: text },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { raw: undefined, unified: 'stop' },
          usage,
        },
      ]),
    }),
  });
}

async function runFollowUp(
  responseMessages: ModelMessage[],
  label: string,
): Promise<void> {
  const expectedText = `accepted ${label} messages`;
  const result = streamText({
    model: createTextModel(expectedText),
    messages: [
      { role: 'user', content: 'List all the tasks' },
      ...responseMessages,
    ],
    tools: { listTasks },
  });

  let text = '';
  for await (const chunk of result.textStream) {
    text += chunk;
  }

  if (text !== expectedText) {
    throw new Error(
      `Follow-up using ${label} messages returned ${JSON.stringify(text)}.`,
    );
  }
}

async function main(): Promise<void> {
  const firstResult = streamText({
    model: createToolCallModel(),
    messages: [{ role: 'user', content: 'List all the tasks' }],
    tools: { listTasks },
  });

  for await (const _ of firstResult.fullStream) {
    // Consume the stream so the tool executes and response messages are built.
  }

  const directMessages = (await firstResult.response).messages;
  const serializedMessages = JSON.parse(
    JSON.stringify(directMessages),
  ) as ModelMessage[];

  const serializedToolMessage = serializedMessages.find(
    message => message.role === 'tool',
  );
  const serializedToolResult =
    serializedToolMessage?.role === 'tool'
      ? serializedToolMessage.content.find(part => part.type === 'tool-result')
      : undefined;
  const serializedTasks =
    serializedToolResult?.output.type === 'json' &&
    Array.isArray(serializedToolResult.output.value)
      ? serializedToolResult.output.value
      : undefined;

  if (
    serializedTasks == null ||
    typeof serializedTasks[1] !== 'object' ||
    serializedTasks[1] == null ||
    Array.isArray(serializedTasks[1]) ||
    'startedAt' in serializedTasks[1] ||
    'completedAt' in serializedTasks[1]
  ) {
    throw new Error(
      'Setup failed: JSON serialization did not strip the undefined task properties.',
    );
  }

  await runFollowUp(directMessages, 'direct');
  await runFollowUp(serializedMessages, 'JSON-serialized');

  console.log(
    'PASS: manual streamText follow-ups accepted direct and JSON-serialized tool-result arrays with undefined properties.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
