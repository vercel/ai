import assert from 'node:assert/strict';
import {
  createAgentUIStream,
  ToolLoopAgent,
  type UIMessage,
  type UIMessageStreamOnFinishCallback,
} from 'ai';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
  MockLanguageModelV3,
} from 'ai/test';

type AgentUIMessage = UIMessage<unknown, never, {}>;
type FinishEvent = Parameters<
  UIMessageStreamOnFinishCallback<AgentUIMessage>
>[0];

function createAgent() {
  return new ToolLoopAgent({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'response-metadata',
            id: 'provider-response-id',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'new response' },
          { type: 'text-end', id: 'text-1' },
          {
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
          },
        ]),
      }),
    }),
  });
}

async function verifyExistingPersistenceSemantics() {
  const continuationMessages: AgentUIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Continue the answer.' }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Existing answer. ' }],
    },
  ];

  let continuationFinish: FinishEvent | undefined;

  const continuationStream = await createAgentUIStream({
    agent: createAgent(),
    uiMessages: continuationMessages,
    originalMessages: continuationMessages,
    generateMessageId: () => 'unused-generated-id',
    onFinish: event => {
      continuationFinish = event;
    },
  });
  const continuationChunks =
    await convertReadableStreamToArray(continuationStream);

  assert.equal(
    continuationChunks.find(chunk => chunk.type === 'start')?.messageId,
    'assistant-1',
    'continuation must reuse the existing assistant message ID',
  );
  assert.ok(continuationFinish, 'continuation onFinish must be called');
  assert.equal(continuationFinish.isContinuation, true);
  assert.deepEqual(
    continuationFinish.messages.map(message => message.id),
    ['user-1', 'assistant-1'],
    'onFinish must return the original history with the assistant message updated in place',
  );
  assert.equal(continuationFinish.responseMessage.id, 'assistant-1');

  const newMessageHistory: AgentUIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'First question' }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'First answer' }],
    },
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'Second question' }],
    },
  ];

  let newMessageFinish: FinishEvent | undefined;

  const newMessageStream = await createAgentUIStream({
    agent: createAgent(),
    uiMessages: newMessageHistory,
    originalMessages: newMessageHistory,
    generateMessageId: () => 'generated-assistant-2',
    onFinish: event => {
      newMessageFinish = event;
    },
  });
  const newMessageChunks = await convertReadableStreamToArray(newMessageStream);

  assert.equal(
    newMessageChunks.find(chunk => chunk.type === 'start')?.messageId,
    'generated-assistant-2',
    'generateMessageId must set the new assistant message ID',
  );
  assert.ok(newMessageFinish, 'new-message onFinish must be called');
  assert.equal(newMessageFinish.isContinuation, false);
  assert.deepEqual(
    newMessageFinish.messages.map(message => message.id),
    ['user-1', 'assistant-1', 'user-2', 'generated-assistant-2'],
    'onFinish must return the full original history plus the new assistant message',
  );
}

async function verifyOriginalMessagesOnlyFlow() {
  const originalMessages: AgentUIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Persisted question' }],
    },
  ];

  let finish: FinishEvent | undefined;

  try {
    const stream = await createAgentUIStream({
      agent: createAgent(),
      originalMessages,
      generateMessageId: () => 'assistant-1',
      onFinish: (event: FinishEvent) => {
        finish = event;
      },
    } as unknown as Parameters<typeof createAgentUIStream>[0]);

    await convertReadableStreamToArray(stream);
  } catch (error) {
    const errorText = error instanceof Error ? error.message : String(error);

    if (
      errorText ===
      'Invalid argument for parameter messages: messages parameter must be provided'
    ) {
      throw new Error(
        'ISSUE_10367: createAgentUIStream rejects an originalMessages-only persistence flow because uiMessages is still required.',
      );
    }

    throw error;
  }

  assert.ok(finish, 'originalMessages-only onFinish must be called');
  assert.deepEqual(
    finish.messages.map(message => message.id),
    ['user-1', 'assistant-1'],
    'originalMessages-only persistence must return the complete updated history',
  );
}

async function main() {
  await verifyExistingPersistenceSemantics();
  await verifyOriginalMessagesOnlyFlow();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
