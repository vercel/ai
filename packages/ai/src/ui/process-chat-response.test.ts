import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { DataStreamPart } from '../../src';
import { consumeStream } from '../util/consume-stream';
import { processChatResponse } from './process-chat-response';
import { UIMessage } from './ui-messages';

function createDataProtocolStream(parts: DataStreamPart[]) {
  return convertArrayToReadableStream(parts);
}

let updateCalls: Array<{
  message: UIMessage;
}> = [];
const onUpdate = (options: { message: UIMessage }) => {
  // clone to preserve the original object
  if (data) updateDataCalls.push(structuredClone(data));
};

let finishCalls: Array<{
  message: UIMessage | undefined;
}> = [];
const onFinish = (options: { message: UIMessage | undefined }) => {
  // clone to preserve the original object
  finishCalls.push({ ...options });
};

const chatId = 'chat-id';
let store: ChatStore;
let storeSpy: MockInstance<
  ({
    chatId,
    partDelta,
    messageId,
  }: {
    chatId: string;
    partDelta: UIMessage['parts'][number];
    messageId?: string;
  }) => Promise<void>
>;

export function mockId(): () => string {
  let counter = 0;
  return () => `id-${counter++}`;
}

describe('processChatResponse', () => {
  beforeEach(() => {
    updateDataCalls = [];
    finishCalls = [];
  });

  describe('scenario: simple text response', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date(),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');

      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'Hello, ' },
        { type: 'text', value: 'world!' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Hello, ",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server-side tool roundtrip', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date(),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'The weather in London is sunny.' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "state": "call",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server-side tool roundtrip with existing assistant message', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hello, how are you?' }],
              },
              {
                role: 'assistant',
                id: 'original-id',
                createdAt: new Date('2023-01-02T00:00:00.000Z'),
                parts: [
                  {
                    type: 'tool-invocation',
                    toolInvocation: {
                      args: {},
                      result: { location: 'Berlin' },
                      state: 'result',
                      step: 0,
                      toolCallId: 'tool-call-id-original',
                      toolName: 'tool-name-original',
                    },
                  },
                ],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'The weather in London is sunny.' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: {
            role: 'assistant',
            id: 'original-id',
            metadata: undefined,
            parts: [
              {
                type: 'tool-invocation',
                toolInvocation: {
                  args: {},
                  result: { location: 'Berlin' },
                  state: 'result',
                  step: 0,
                  toolCallId: 'tool-call-id-original',
                  toolName: 'tool-name-original',
                },
              },
            ],
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "state": "call",
                    "step": 1,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 1,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 1,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 1,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "toolInvocation": {
                    "args": {},
                    "result": {
                      "location": "Berlin",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id-original",
                    "toolName": "tool-name-original",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 1,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server-side tool roundtrip with multiple assistant texts', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'I will ' },
        { type: 'text', value: 'use a tool to get the weather in London.' },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'The weather in London ' },
        { type: 'text', value: 'is sunny.' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will ",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "state": "call",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London ",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server-side tool roundtrip with multiple assistant reasoning', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'reasoning', value: { text: 'I will ' } },
        {
          type: 'reasoning',
          value: {
            text: 'use a tool to get the weather in London.',
            providerMetadata: {
              testProvider: { signature: '1234567890' },
            },
          },
        },
        { type: 'reasoning-part-finish', value: null },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-id',
            result: { weather: 'sunny' },
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'start-step', value: {} },
        {
          type: 'reasoning',
          value: {
            text: 'I know know the weather in London.',
            providerMetadata: {
              testProvider: { signature: 'abc123' },
            },
          },
        },
        { type: 'reasoning-part-finish', value: null },
        { type: 'text', value: 'The weather in London is sunny.' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "text": "I will ",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "state": "call",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "text": "I know know the weather in London.",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "text": "I know know the weather in London.",
                  "type": "reasoning",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": {
                      "weather": "sunny",
                    },
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "text": "I know know the weather in London.",
                  "type": "reasoning",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: message metadata', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        {
          type: 'start',
          value: {
            messageId: 'msg-123',
            metadata: {
              start: 'start-1',
              shared: {
                key1: 'value-1a',
                key2: 'value-2a',
              },
            },
          },
        },
        {
          type: 'start-step',
          value: {
            metadata: {
              startStep: 'start-step-1',
              shared: {
                key1: 'value-1b',
                key3: 'value-3b',
              },
            },
          },
        },
        { type: 'text', value: 't1' },
        {
          type: 'metadata',
          value: {
            metadata: {
              metadata: 'metadata-1',
              shared: {
                key1: 'value-1c',
                key4: 'value-4c',
              },
            },
          },
        },
        { type: 'text', value: 't2' },
        {
          type: 'finish-step',
          value: {
            metadata: {
              finishStep: 'finish-step-1',
              shared: {
                key1: 'value-1d',
                key5: 'value-5d',
              },
            },
          },
        },
        {
          type: 'finish',
          value: {
            metadata: {
              finish: 'finish-1',
              shared: {
                key1: 'value-1e',
                key6: 'value-6e',
              },
            },
          },
        },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "shared": {
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "shared": {
                  "key1": "value-1b",
                  "key2": "value-2a",
                  "key3": "value-3b",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "shared": {
                  "key1": "value-1b",
                  "key2": "value-2a",
                  "key3": "value-3b",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1c",
                  "key2": "value-2a",
                  "key3": "value-3b",
                  "key4": "value-4c",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1c",
                  "key2": "value-2a",
                  "key3": "value-3b",
                  "key4": "value-4c",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1t2",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "finishStep": "finish-step-1",
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1d",
                  "key2": "value-2a",
                  "key3": "value-3b",
                  "key4": "value-4c",
                  "key5": "value-5d",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1t2",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "finish": "finish-1",
                "finishStep": "finish-step-1",
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1e",
                  "key2": "value-2a",
                  "key3": "value-3b",
                  "key4": "value-4c",
                  "key5": "value-5d",
                  "key6": "value-6e",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1t2",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "finish": "finish-1",
                "finishStep": "finish-step-1",
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1e",
                  "key2": "value-2a",
                  "key3": "value-3b",
                  "key4": "value-4c",
                  "key5": "value-5d",
                  "key6": "value-6e",
                },
                "start": "start-1",
                "startStep": "start-step-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1t2",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: delayed message metadata after finish', () => {
    beforeEach(async () => {
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'text', value: 't1' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
        {
          type: 'metadata',
          value: {
            metadata: {
              key1: 'value-1',
            },
          },
        },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "key1": "value-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "key1": "value-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: message metadata with existing assistant lastMessage', () => {
    beforeEach(async () => {
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        {
          type: 'start-step',
          value: {
            metadata: {
              key1: 'value-1b',
              key2: 'value-2b',
            },
          },
        },
        { type: 'text', value: 't1' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: {
            role: 'assistant',
            id: 'original-id',
            metadata: {
              key1: 'value-1a',
              key3: 'value-3a',
            },
            parts: [],
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "key1": "value-1a",
                "key3": "value-3a",
              },
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "key1": "value-1b",
                "key2": "value-2b",
                "key3": "value-3a",
              },
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "key1": "value-1b",
                "key2": "value-2b",
                "key3": "value-3a",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {
                "key1": "value-1b",
                "key2": "value-2b",
                "key3": "value-3a",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "t1",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: tool call streaming', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        {
          type: 'tool-call-streaming-start',
          value: {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
          },
        },
        {
          type: 'tool-call-delta',
          value: {
            toolCallId: 'tool-call-0',
            argsTextDelta: '{"testArg":"t',
          },
        },
        {
          type: 'tool-call-delta',
          value: {
            toolCallId: 'tool-call-0',
            argsTextDelta: 'est-value"}}',
          },
        },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
          },
        },
        {
          type: 'tool-result',
          value: {
            toolCallId: 'tool-call-0',
            result: 'test-result',
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": undefined,
                    "state": "partial-call",
                    "step": 0,
                    "toolCallId": "tool-call-0",
                    "toolName": "test-tool",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "testArg": "t",
                    },
                    "state": "partial-call",
                    "step": 0,
                    "toolCallId": "tool-call-0",
                    "toolName": "test-tool",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "testArg": "test-value",
                    },
                    "state": "partial-call",
                    "step": 0,
                    "toolCallId": "tool-call-0",
                    "toolName": "test-tool",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "testArg": "test-value",
                    },
                    "state": "call",
                    "step": 0,
                    "toolCallId": "tool-call-0",
                    "toolName": "test-tool",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "testArg": "test-value",
                    },
                    "result": "test-result",
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-0",
                    "toolName": "test-tool",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "testArg": "test-value",
                    },
                    "result": "test-result",
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-0",
                    "toolName": "test-tool",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server provides message ids', () => {
    beforeEach(async () => {
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'Hello, ' },
        { type: 'text', value: 'world!' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Hello, ",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server provides reasoning', () => {
    beforeEach(async () => {
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        {
          type: 'reasoning',
          value: {
            text: 'I will open the conversation',
          },
        },
        {
          type: 'reasoning',
          value: {
            text: ' with witty banter. ',
            providerMetadata: {
              testProvider: { signature: '1234567890' },
            },
          },
        },
        {
          type: 'reasoning',
          value: {
            text: 'redacted-data',
            providerMetadata: {
              testProvider: { isRedacted: true },
            },
          },
        },
        {
          type: 'reasoning',
          value: {
            text: 'Once the user has relaxed,',
          },
        },
        {
          type: 'reasoning',
          value: {
            text: ' I will pry for valuable information.',
            providerMetadata: {
              testProvider: { signature: 'abc123' },
            },
          },
        },
        { type: 'reasoning-part-finish', value: null },
        { type: 'text', value: 'Hi there!' },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "text": "I will open the conversation",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "text": "I will open the conversation with witty banter. redacted-data",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "text": "I will open the conversation with witty banter. redacted-dataOnce the user has relaxed,",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "text": "I will open the conversation with witty banter. redacted-dataOnce the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "text": "I will open the conversation with witty banter. redacted-dataOnce the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
                {
                  "text": "Hi there!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "text": "I will open the conversation with witty banter. redacted-dataOnce the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
                {
                  "text": "Hi there!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: onToolCall is executed', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        {
          type: 'tool-call',
          value: {
            toolCallId: 'tool-call-id',
            toolName: 'tool-name',
            args: { city: 'London' },
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
          onToolCall: vi.fn().mockResolvedValue('test-result'),
        }),
      });
    });

    it('should call the update function twice with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "state": "call",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": "test-result",
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "toolInvocation": {
                    "args": {
                      "city": "London",
                    },
                    "result": "test-result",
                    "state": "result",
                    "step": 0,
                    "toolCallId": "tool-call-id",
                    "toolName": "tool-name",
                  },
                  "type": "tool-invocation",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server provides sources', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'The weather in London is sunny.' },
        {
          type: 'source',
          value: {
            type: 'source',
            sourceType: 'url',
            id: 'source-id',
            url: 'https://example.com',
            title: 'Example',
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
                {
                  "source": {
                    "id": "source-id",
                    "sourceType": "url",
                    "title": "Example",
                    "type": "source",
                    "url": "https://example.com",
                  },
                  "type": "source",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "The weather in London is sunny.",
                  "type": "text",
                },
                {
                  "source": {
                    "id": "source-id",
                    "sourceType": "url",
                    "title": "Example",
                    "type": "source",
                    "url": "https://example.com",
                  },
                  "type": "source",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });

  describe('scenario: server provides file parts', () => {
    beforeEach(async () => {
      store = new ChatStore({
        chats: {
          [chatId]: {
            messages: [
              {
                role: 'user',
                id: 'user-message-id',
                createdAt: new Date('2023-01-01T00:00:00.000Z'),
                parts: [{ type: 'text', text: 'Hi' }],
              },
            ],
          },
        },
        '~internal': {
          currentDate: vi.fn().mockReturnValue(new Date('2025-01-01')),
        },
      });
      storeSpy = vi.spyOn(store, 'addOrUpdateAssistantMessageParts');
      const stream = createDataProtocolStream([
        { type: 'start', value: { messageId: 'msg-123' } },
        { type: 'start-step', value: {} },
        { type: 'text', value: 'Here is a file:' },
        {
          type: 'file',
          value: {
            url: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
            mediaType: 'text/plain',
          },
        },
        { type: 'text', value: 'And another one:' },
        {
          type: 'file',
          value: {
            url: 'data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9',
            mediaType: 'application/json',
          },
        },
        { type: 'finish-step', value: {} },
        { type: 'finish', value: {} },
      ]);

      await consumeStream({
        stream: processChatResponse({
          stream,
          onUpdate,
          onFinish,
          newMessageId: 'no-id',
          lastMessage: undefined,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(updateCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Here is a file:",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Here is a file:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Here is a file:And another one:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Here is a file:And another one:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "mediaType": "application/json",
                  "type": "file",
                  "url": "data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(finishCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": {},
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "text": "Here is a file:And another one:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "mediaType": "application/json",
                  "type": "file",
                  "url": "data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });
  });
});
