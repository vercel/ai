import assert from 'node:assert/strict';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { streamText, tool, type ModelMessage } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
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

function createStream(parts: LanguageModelV4StreamPart[]) {
  return convertArrayToReadableStream(parts);
}

async function runFollowUp(messages: ModelMessage[]) {
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: createStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'Second iteration completed.',
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  const result = streamText({
    model,
    messages,
    tools: { listTasks },
  });

  await result.consumeStream();
  assert.equal(await result.text, 'Second iteration completed.');
  assert.equal(model.doStreamCalls.length, 1);
}

async function main() {
  const firstModel = new MockLanguageModelV4({
    doStream: async () => ({
      stream: createStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'listTasks',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
          usage,
        },
      ]),
    }),
  });

  const firstResult = streamText({
    model: firstModel,
    messages: [{ role: 'user', content: 'List all the tasks' }],
    tools: { listTasks },
  });

  await firstResult.consumeStream();
  const firstResponse = await firstResult.response;
  const directMessages: ModelMessage[] = [
    { role: 'user', content: 'List all the tasks' },
    ...firstResponse.messages,
  ];

  const toolMessage = firstResponse.messages.find(
    message => message.role === 'tool',
  );
  assert.ok(toolMessage != null);

  const toolResult = toolMessage.content.find(
    part => part.type === 'tool-result',
  );
  assert.ok(toolResult?.output.type === 'json');
  assert.ok(Array.isArray(toolResult.output.value));

  const secondTask = toolResult.output.value[1];
  assert.ok(
    secondTask != null &&
      typeof secondTask === 'object' &&
      !Array.isArray(secondTask),
  );
  assert.ok(Object.hasOwn(secondTask, 'startedAt'));
  assert.equal(secondTask.startedAt, undefined);

  await runFollowUp(directMessages);

  const serializedMessages = JSON.parse(
    JSON.stringify(directMessages),
  ) as ModelMessage[];
  const serializedToolMessage = serializedMessages.find(
    message => message.role === 'tool',
  );
  assert.ok(serializedToolMessage != null);

  const serializedToolResult = serializedToolMessage.content.find(
    part => part.type === 'tool-result',
  );
  assert.ok(serializedToolResult?.output.type === 'json');
  assert.ok(Array.isArray(serializedToolResult.output.value));

  const serializedSecondTask = serializedToolResult.output.value[1];
  assert.ok(
    serializedSecondTask != null &&
      typeof serializedSecondTask === 'object' &&
      !Array.isArray(serializedSecondTask),
  );
  assert.ok(!Object.hasOwn(serializedSecondTask, 'startedAt'));

  await runFollowUp(serializedMessages);

  console.log(
    'Issue #10893 did not reproduce: direct and JSON-serialized tool-result messages both passed validation on the next streamText call.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
