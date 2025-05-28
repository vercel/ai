import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { UIMessageStreamPart } from '../../src/ui-message-stream/ui-message-stream-parts';
import { consumeStream } from '../util/consume-stream';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from './process-ui-message-stream';
import { UIMessage } from './ui-messages';

function createUIMessageStream(parts: UIMessageStreamPart[]) {
  return convertArrayToReadableStream(parts);
}

export function mockId(): () => string {
  let counter = 0;
  return () => `id-${counter++}`;
}

describe('processUIMessageStream', () => {
  let writeCalls: Array<{ message: UIMessage }> = [];
  let state: StreamingUIMessageState | undefined;

  beforeEach(() => {
    writeCalls = [];
    state = undefined;
  });

  const runUpdateMessageJob = async (
    job: (options: {
      state: StreamingUIMessageState;
      write: () => void;
    }) => Promise<void>,
  ) => {
    await job({
      state: state!,
      write: () => {
        writeCalls.push({ message: structuredClone(state!.message) });
      },
    });
  };

  describe('text', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text', text: 'Hello, ' },
        { type: 'text', text: 'world!' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('server-side tool roundtrip', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-call',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          args: { city: 'London' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-call-id',
          result: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text', text: 'The weather in London is sunny.' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('server-side tool roundtrip with existing assistant message', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-call',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          args: { city: 'London' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-call-id',
          result: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text', text: 'The weather in London is sunny.' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
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
                toolCallId: 'tool-call-id-original',
                toolName: 'tool-name-original',
              },
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('server-side tool roundtrip with multiple assistant texts', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text', text: 'I will ' },
        { type: 'text', text: 'use a tool to get the weather in London.' },
        {
          type: 'tool-call',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          args: { city: 'London' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-call-id',
          result: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text', text: 'The weather in London ' },
        { type: 'text', text: 'is sunny.' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('server-side tool roundtrip with multiple assistant reasoning', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'reasoning', text: 'I will ' },
        {
          type: 'reasoning',
          text: 'use a tool to get the weather in London.',
          providerMetadata: {
            testProvider: { signature: '1234567890' },
          },
        },
        { type: 'reasoning-part-finish' },
        {
          type: 'tool-call',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          args: { city: 'London' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-call-id',
          result: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        {
          type: 'reasoning',
          text: 'I know know the weather in London.',
          providerMetadata: {
            testProvider: { signature: 'abc123' },
          },
        },
        { type: 'reasoning-part-finish' },
        { type: 'text', text: 'The weather in London is sunny.' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('message metadata', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
          messageId: 'msg-123',
          metadata: {
            start: 'start-1',
            shared: {
              key1: 'value-1a',
              key2: 'value-2a',
            },
          },
        },
        {
          type: 'start-step',
          metadata: {
            startStep: 'start-step-1',
            shared: {
              key1: 'value-1b',
              key3: 'value-3b',
            },
          },
        },
        { type: 'text', text: 't1' },
        {
          type: 'metadata',
          metadata: {
            metadata: 'metadata-1',
            shared: {
              key1: 'value-1c',
              key4: 'value-4c',
            },
          },
        },
        { type: 'text', text: 't2' },
        {
          type: 'finish-step',
          metadata: {
            finishStep: 'finish-step-1',
            shared: {
              key1: 'value-1d',
              key5: 'value-5d',
            },
          },
        },
        {
          type: 'finish',
          metadata: {
            finish: 'finish-1',
            shared: {
              key1: 'value-1e',
              key6: 'value-6e',
            },
          },
        },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('message metadata delayed after finish', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text', text: 't1' },
        { type: 'finish-step' },
        { type: 'finish' },
        {
          type: 'metadata',
          metadata: {
            key1: 'value-1',
          },
        },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('message metadata with existing assistant lastMessage', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        {
          type: 'start-step',
          metadata: {
            key1: 'value-1b',
            key2: 'value-2b',
          },
        },
        { type: 'text', text: 't1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          metadata: {
            key1: 'value-1a',
            key3: 'value-3a',
          },
          parts: [],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('tool call streaming', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-call-streaming-start',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'tool-call-0',
          argsTextDelta: '{"testArg":"t',
        },
        {
          type: 'tool-call-delta',
          toolCallId: 'tool-call-0',
          argsTextDelta: 'est-value"}}',
        },
        {
          type: 'tool-call',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-call-0',
          result: 'test-result',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
                "toolCallId": "tool-call-0",
                "toolName": "test-tool",
              },
              "type": "tool-invocation",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('start with message id', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text', text: 'Hello, ' },
        { type: 'text', text: 'world!' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('reasoning', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'reasoning',
          text: 'I will open the conversation',
        },
        {
          type: 'reasoning',
          text: ' with witty banter. ',
          providerMetadata: {
            testProvider: { signature: '1234567890' },
          },
        },
        {
          type: 'reasoning',
          text: 'redacted-data',
          providerMetadata: {
            testProvider: { isRedacted: true },
          },
        },
        {
          type: 'reasoning',
          text: 'Once the user has relaxed,',
        },
        {
          type: 'reasoning',
          text: ' I will pry for valuable information.',
          providerMetadata: {
            testProvider: { signature: 'abc123' },
          },
        },
        { type: 'reasoning-part-finish' },
        { type: 'text', text: 'Hi there!' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('onToolCall is executed', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-call',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          args: { city: 'London' },
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onToolCall: vi.fn().mockResolvedValue('test-result'),
        }),
      });
    });

    it('should call the update function twice with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
                "toolCallId": "tool-call-id",
                "toolName": "tool-name",
              },
              "type": "tool-invocation",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('sources', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text', text: 'The weather in London is sunny.' },
        {
          type: 'source-url',
          sourceId: 'source-id',
          url: 'https://example.com',
          title: 'Example',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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
                  "providerMetadata": undefined,
                  "sourceId": "source-id",
                  "title": "Example",
                  "type": "source-url",
                  "url": "https://example.com",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should call the onFinish function with the correct arguments', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
              "providerMetadata": undefined,
              "sourceId": "source-id",
              "title": "Example",
              "type": "source-url",
              "url": "https://example.com",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('file parts', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text', text: 'Here is a file:' },
        {
          type: 'file',
          url: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
          mediaType: 'text/plain',
        },
        { type: 'text', text: 'And another one:' },
        {
          type: 'file',
          url: 'data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9',
          mediaType: 'application/json',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
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
        }
      `);
    });
  });

  describe('data ui parts (single part)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'data-test',
          data: 'example-data-can-be-anything',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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
                  "data": "example-data-can-be-anything",
                  "type": "data-test",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
          "id": "msg-123",
          "metadata": {},
          "parts": [
            {
              "type": "step-start",
            },
            {
              "data": "example-data-can-be-anything",
              "type": "data-test",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('data ui parts (single part with id and replacement update)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'data-test',
          id: 'data-part-id',
          data: 'example-data-can-be-anything',
        },
        {
          type: 'data-test',
          id: 'data-part-id',
          data: 'or-something-else',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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
                  "data": "example-data-can-be-anything",
                  "id": "data-part-id",
                  "type": "data-test",
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
                  "data": "or-something-else",
                  "id": "data-part-id",
                  "type": "data-test",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
          "id": "msg-123",
          "metadata": {},
          "parts": [
            {
              "type": "step-start",
            },
            {
              "data": "or-something-else",
              "id": "data-part-id",
              "type": "data-test",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('data ui parts (single part with id and merge update)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'data-test',
          id: 'data-part-id',
          data: {
            a: 'a1',
            b: 'b1',
          },
        },
        {
          type: 'data-test',
          id: 'data-part-id',
          data: {
            b: 'b2',
            c: 'c2',
          },
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState();

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
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
                  "data": {
                    "a": "a1",
                    "b": "b1",
                  },
                  "id": "data-part-id",
                  "type": "data-test",
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
                  "data": {
                    "a": "a1",
                    "b": "b2",
                    "c": "c2",
                  },
                  "id": "data-part-id",
                  "type": "data-test",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
          "id": "msg-123",
          "metadata": {},
          "parts": [
            {
              "type": "step-start",
            },
            {
              "data": {
                "a": "a1",
                "b": "b2",
                "c": "c2",
              },
              "id": "data-part-id",
              "type": "data-test",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });
});
