import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { consumeStream } from '../util/consume-stream';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  StreamingUIMessageState,
} from './process-ui-message-stream';
import {
  DynamicToolUIPart,
  InferUIMessageData,
  isDynamicToolUIPart,
  isToolUIPart,
  ToolUIPart,
  UIMessage,
} from './ui-messages';
import { beforeEach, describe, it, expect, vi } from 'vitest';

function createUIMessageStream(parts: UIMessageChunk[]) {
  return convertArrayToReadableStream(parts);
}

describe('processUIMessageStream', () => {
  let writeCalls: Array<{ message: UIMessage }> = [];
  let state: StreamingUIMessageState<UIMessage> | undefined;

  beforeEach(() => {
    writeCalls = [];
    state = undefined;
  });

  const runUpdateMessageJob = async (
    job: (options: {
      state: StreamingUIMessageState<UIMessage>;
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
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
        { type: 'text-delta', id: 'text-1', delta: 'world!' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('errors', () => {
    let errors: Array<unknown>;

    beforeEach(async () => {
      errors = [];

      const stream = createUIMessageStream([
        { type: 'error', errorText: 'test error' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            errors.push(error);
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`[]`);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [],
          "role": "assistant",
        }
      `);
    });

    it('should call the onError function with the correct arguments', async () => {
      expect(errors).toMatchInlineSnapshot(`
        [
          [Error: test error],
        ]
      `);
    });
  });

  describe('server-side tool roundtrip', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { city: 'London' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-id',
          output: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'The weather in London is sunny.',
        },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "type": "step-start",
            },
            {
              "errorText": undefined,
              "input": {
                "city": "London",
              },
              "output": {
                "weather": "sunny",
              },
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "output-available",
              "title": undefined,
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
              "yields": [],
            },
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { city: 'London' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-id',
          output: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'The weather in London is sunny.',
        },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          metadata: undefined,
          parts: [
            {
              type: 'tool-tool-name-original',
              toolCallId: 'tool-call-id-original',
              state: 'output-available',
              input: {},
              output: { location: 'Berlin' },
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "input": {},
                  "output": {
                    "location": "Berlin",
                  },
                  "state": "output-available",
                  "toolCallId": "tool-call-id-original",
                  "type": "tool-tool-name-original",
                },
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "input": {},
              "output": {
                "location": "Berlin",
              },
              "state": "output-available",
              "toolCallId": "tool-call-id-original",
              "type": "tool-tool-name-original",
            },
            {
              "type": "step-start",
            },
            {
              "errorText": undefined,
              "input": {
                "city": "London",
              },
              "output": {
                "weather": "sunny",
              },
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "output-available",
              "title": undefined,
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
              "yields": [],
            },
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'I will ' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'use a tool to get the weather in London.',
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { city: 'London' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-id',
          output: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-2' },
        { type: 'text-delta', id: 'text-2', delta: 'The weather in London ' },
        { type: 'text-delta', id: 'text-2', delta: 'is sunny.' },
        { type: 'text-end', id: 'text-2' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "text",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
              "text": "I will use a tool to get the weather in London.",
              "type": "text",
            },
            {
              "errorText": undefined,
              "input": {
                "city": "London",
              },
              "output": {
                "weather": "sunny",
              },
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "output-available",
              "title": undefined,
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
              "yields": [],
            },
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
        { type: 'reasoning-start', id: 'reasoning-1' },
        {
          type: 'reasoning-delta',
          id: 'reasoning-1',
          delta: 'I will ',
          providerMetadata: {
            testProvider: { signature: '1234567890' },
          },
        },
        {
          type: 'reasoning-delta',
          id: 'reasoning-1',
          delta: 'use a tool to get the weather in London.',
        },
        { type: 'reasoning-end', id: 'reasoning-1' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { city: 'London' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-id',
          output: { weather: 'sunny' },
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'reasoning-start', id: 'reasoning-2' },
        {
          type: 'reasoning-delta',
          id: 'reasoning-2',
          delta: 'I now know the weather in London.',
          providerMetadata: {
            testProvider: { signature: 'abc123' },
          },
        },
        { type: 'reasoning-end', id: 'reasoning-2' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'The weather in London is sunny.',
        },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "streaming",
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
              "metadata": undefined,
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
                  "state": "streaming",
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
              "metadata": undefined,
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
                  "state": "done",
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
              "metadata": undefined,
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
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "state": "streaming",
                  "text": "I now know the weather in London.",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "state": "done",
                  "text": "I now know the weather in London.",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "state": "done",
                  "text": "I now know the weather in London.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "state": "done",
                  "text": "I now know the weather in London.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
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
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "state": "done",
                  "text": "I now know the weather in London.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
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
                  "state": "done",
                  "text": "I will use a tool to get the weather in London.",
                  "type": "reasoning",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": {
                    "weather": "sunny",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "state": "done",
                  "text": "I now know the weather in London.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "type": "step-start",
            },
            {
              "providerMetadata": {
                "testProvider": {
                  "signature": "1234567890",
                },
              },
              "state": "done",
              "text": "I will use a tool to get the weather in London.",
              "type": "reasoning",
            },
            {
              "errorText": undefined,
              "input": {
                "city": "London",
              },
              "output": {
                "weather": "sunny",
              },
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "output-available",
              "title": undefined,
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
              "yields": [],
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
              "state": "done",
              "text": "I now know the weather in London.",
              "type": "reasoning",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
              "text": "The weather in London is sunny.",
              "type": "text",
            },
          ],
          "role": "assistant",
        }
      `);
    });
  });

  describe('server-side tool roundtrip with output-error', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { city: 'London' },
        },
        {
          type: 'tool-output-error',
          toolCallId: 'tool-call-id',
          errorText: 'error-text',
        },
        { type: 'finish-step' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'The weather in London is sunny.',
        },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "type": "step-start",
            },
            {
              "errorText": "error-text",
              "input": {
                "city": "London",
              },
              "output": undefined,
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "output-error",
              "title": undefined,
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
              "yields": undefined,
            },
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
          messageMetadata: {
            start: 'start-1',
            shared: {
              key1: 'value-1a',
              key2: 'value-2a',
            },
          },
        },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 't1' },
        {
          type: 'message-metadata',
          messageMetadata: {
            metadata: 'metadata-1',
          },
        },
        { type: 'text-delta', id: 'text-1', delta: 't2' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        {
          type: 'finish',
          messageMetadata: {
            finish: 'finish-1',
            shared: {
              key1: 'value-1e',
              key6: 'value-6e',
            },
          },
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
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
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
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
                "shared": {
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1a",
                  "key2": "value-2a",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
                "metadata": "metadata-1",
                "shared": {
                  "key1": "value-1e",
                  "key2": "value-2a",
                  "key6": "value-6e",
                },
                "start": "start-1",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
            "metadata": "metadata-1",
            "shared": {
              "key1": "value-1e",
              "key2": "value-2a",
              "key6": "value-6e",
            },
            "start": "start-1",
          },
          "parts": [
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 't1' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
        {
          type: 'message-metadata',
          messageMetadata: {
            key1: 'value-1',
          },
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
                  "providerMetadata": undefined,
                  "state": "done",
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
              "providerMetadata": undefined,
              "state": "done",
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
        {
          type: 'start',
          messageId: 'msg-123',
          messageMetadata: {
            key1: 'value-1b',
            key2: 'value-2b',
          },
        },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 't1' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
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
          onError: error => {
            throw error;
          },
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
                "key1": "value-1b",
                "key2": "value-2b",
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
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
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
                "key1": "value-1b",
                "key2": "value-2b",
                "key3": "value-3a",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
                "key1": "value-1b",
                "key2": "value-2b",
                "key3": "value-3a",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
                "key1": "value-1b",
                "key2": "value-2b",
                "key3": "value-3a",
              },
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "providerMetadata": undefined,
              "state": "done",
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
          type: 'tool-input-start',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-call-0',
          inputTextDelta: '{"testArg":"t',
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-call-0',
          inputTextDelta: 'est-value"}}',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          input: { testArg: 'test-value' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-0',
          output: 'test-result',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "testArg": "t",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "testArg": "test-value",
                  },
                  "output": "test-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
                  "yields": [],
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
              "type": "step-start",
            },
            {
              "errorText": undefined,
              "input": {
                "testArg": "test-value",
              },
              "output": "test-result",
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "output-available",
              "title": undefined,
              "toolCallId": "tool-call-0",
              "type": "tool-test-tool",
              "yields": [],
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
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
        { type: 'text-delta', id: 'text-1', delta: 'world!' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
        { type: 'reasoning-start', id: 'reasoning-1' },
        {
          type: 'reasoning-delta',
          id: 'reasoning-1',
          delta: 'I will open the conversation',
        },
        {
          type: 'reasoning-delta',
          id: 'reasoning-1',
          delta: ' with witty banter. ',
          providerMetadata: {
            testProvider: { signature: '1234567890' },
          },
        },
        { type: 'reasoning-end', id: 'reasoning-1' },
        { type: 'reasoning-start', id: 'reasoning-2' },
        {
          type: 'reasoning-delta',
          id: 'reasoning-2',
          delta: 'redacted-data',
          providerMetadata: {
            testProvider: { isRedacted: true },
          },
        },
        { type: 'reasoning-end', id: 'reasoning-2' },
        { type: 'reasoning-start', id: 'reasoning-3' },
        {
          type: 'reasoning-delta',
          id: 'reasoning-3',
          delta: 'Once the user has relaxed,',
        },
        {
          type: 'reasoning-delta',
          id: 'reasoning-3',
          delta: ' I will pry for valuable information.',
          providerMetadata: {
            testProvider: { signature: 'abc123' },
          },
        },
        { type: 'reasoning-end', id: 'reasoning-3' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hi there!' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
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
                  "state": "streaming",
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
              "metadata": undefined,
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
                  "state": "done",
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
              "metadata": undefined,
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
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "streaming",
                  "text": "redacted-data",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Once the user has relaxed,",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "state": "streaming",
                  "text": "Once the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "state": "done",
                  "text": "Once the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "state": "done",
                  "text": "Once the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "state": "done",
                  "text": "Once the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hi there!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "state": "done",
                  "text": "Once the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hi there!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1234567890",
                    },
                  },
                  "state": "done",
                  "text": "I will open the conversation with witty banter. ",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "isRedacted": true,
                    },
                  },
                  "state": "done",
                  "text": "redacted-data",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "abc123",
                    },
                  },
                  "state": "done",
                  "text": "Once the user has relaxed, I will pry for valuable information.",
                  "type": "reasoning",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
          "metadata": undefined,
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
              "state": "done",
              "text": "I will open the conversation with witty banter. ",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "testProvider": {
                  "isRedacted": true,
                },
              },
              "state": "done",
              "text": "redacted-data",
              "type": "reasoning",
            },
            {
              "providerMetadata": {
                "testProvider": {
                  "signature": "abc123",
                },
              },
              "state": "done",
              "text": "Once the user has relaxed, I will pry for valuable information.",
              "type": "reasoning",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { city: 'London' },
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onToolCall: vi.fn().mockResolvedValue('test-result'),
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function twice with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "London",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
              "type": "step-start",
            },
            {
              "errorText": undefined,
              "input": {
                "city": "London",
              },
              "output": undefined,
              "preliminary": undefined,
              "providerExecuted": undefined,
              "rawInput": undefined,
              "state": "input-available",
              "title": undefined,
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
              "yields": undefined,
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
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'The weather in London is sunny.',
        },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'source-url',
          sourceId: 'source-id',
          url: 'https://example.com',
          title: 'Example',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
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
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Here is a file:' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'file',
          url: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
          mediaType: 'text/plain',
        },
        { type: 'text-start', id: 'text-2' },
        { type: 'text-delta', id: 'text-2', delta: 'And another one:' },
        { type: 'text-end', id: 'text-2' },
        {
          type: 'file',
          url: 'data:application/json;base64,eyJrZXkiOiJ2YWx1ZSJ9',
          mediaType: 'application/json',
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Here is a file:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Here is a file:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "And another one:",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Here is a file:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "And another one:",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Here is a file:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "And another one:",
                  "type": "text",
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
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Here is a file:",
                  "type": "text",
                },
                {
                  "mediaType": "text/plain",
                  "type": "file",
                  "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "And another one:",
                  "type": "text",
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
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
              "text": "Here is a file:",
              "type": "text",
            },
            {
              "mediaType": "text/plain",
              "type": "file",
              "url": "data:text/plain;base64,SGVsbG8gV29ybGQ=",
            },
            {
              "providerMetadata": undefined,
              "state": "done",
              "text": "And another one:",
              "type": "text",
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
    let dataCalls: InferUIMessageData<UIMessage>[] = [];

    beforeEach(async () => {
      dataCalls = [];

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

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
          onData: data => {
            dataCalls.push(data);
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
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
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
          "metadata": undefined,
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

    it('should call the onData callback with the correct arguments', async () => {
      expect(dataCalls).toMatchInlineSnapshot(`
        [
          {
            "data": "example-data-can-be-anything",
            "type": "data-test",
          },
        ]
      `);
    });
  });

  describe('data ui parts (transient part)', () => {
    let dataCalls: InferUIMessageData<UIMessage>[] = [];

    beforeEach(async () => {
      dataCalls = [];

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'data-test',
          data: 'example-data-can-be-anything',
          transient: true,
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
          onData: data => {
            dataCalls.push(data);
          },
        }),
      });
    });

    it('should not call the update function with the transient part', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should not have the transient part in the final message state', async () => {
      expect(state!.message).toMatchInlineSnapshot(`
        {
          "id": "msg-123",
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
          ],
          "role": "assistant",
        }
      `);
    });

    it('should call the onData callback with the transient part', async () => {
      expect(dataCalls).toMatchInlineSnapshot(`
        [
          {
            "data": "example-data-can-be-anything",
            "transient": true,
            "type": "data-test",
          },
        ]
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

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
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
              "metadata": undefined,
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
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
          "metadata": undefined,
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

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "data": {
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
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "data": {
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
          "metadata": undefined,
          "parts": [
            {
              "type": "step-start",
            },
            {
              "data": {
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

  describe('provider-executed static tools', () => {
    let onToolCallInvoked: boolean;

    beforeEach(async () => {
      onToolCallInvoked = false;

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-start',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          providerExecuted: true,
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-call-1',
          inputTextDelta: '{ "query": "test" }',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerExecuted: true,
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-1',
          output: { result: 'provider-result' },
          providerExecuted: true,
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-2',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerExecuted: true,
        },
        {
          type: 'tool-output-error',
          toolCallId: 'tool-call-2',
          errorText: 'error-text',
          providerExecuted: true,
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          onToolCall: () => {
            onToolCallInvoked = true;
          },
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should not call onToolCall', async () => {
      expect(onToolCallInvoked).toBe(false);
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
                  "yields": [],
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "type": "tool-tool-name",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": undefined,
            "input": {
              "query": "test",
            },
            "output": {
              "result": "provider-result",
            },
            "preliminary": undefined,
            "providerExecuted": true,
            "rawInput": undefined,
            "state": "output-available",
            "title": undefined,
            "toolCallId": "tool-call-1",
            "type": "tool-tool-name",
            "yields": [],
          },
          {
            "errorText": "error-text",
            "input": {
              "query": "test",
            },
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": true,
            "rawInput": undefined,
            "state": "output-error",
            "title": undefined,
            "toolCallId": "tool-call-2",
            "type": "tool-tool-name",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  describe('provider-executed dynamic tools', () => {
    let onToolCallInvoked: boolean;

    beforeEach(async () => {
      onToolCallInvoked = false;

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-start',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          providerExecuted: true,
          dynamic: true,
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-call-1',
          inputTextDelta: '{ "query": "test" }',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerExecuted: true,
          dynamic: true,
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-1',
          output: { result: 'provider-result' },
          providerExecuted: true,
          dynamic: true,
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-2',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerExecuted: true,
          dynamic: true,
        },
        {
          type: 'tool-output-error',
          toolCallId: 'tool-call-2',
          errorText: 'error-text',
          providerExecuted: true,
          dynamic: true,
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          onToolCall: () => {
            onToolCallInvoked = true;
          },
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should not call onToolCall', async () => {
      expect(onToolCallInvoked).toBe(false);
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": [],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": undefined,
            "input": {
              "query": "test",
            },
            "output": {
              "result": "provider-result",
            },
            "preliminary": undefined,
            "providerExecuted": true,
            "rawInput": undefined,
            "state": "output-available",
            "title": undefined,
            "toolCallId": "tool-call-1",
            "toolName": "tool-name",
            "type": "dynamic-tool",
            "yields": [],
          },
          {
            "errorText": "error-text",
            "input": {
              "query": "test",
            },
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": true,
            "rawInput": undefined,
            "state": "output-error",
            "title": undefined,
            "toolCallId": "tool-call-2",
            "toolName": "tool-name",
            "type": "dynamic-tool",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  it('should call onToolCall for client-executed tools', async () => {
    let onToolCallInvoked = false;

    const stream = createUIMessageStream([
      { type: 'start', messageId: 'msg-123' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'tool-call-id',
        toolName: 'tool-name',
        input: { query: 'test' },
      },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    state = createStreamingUIMessageState({
      messageId: 'msg-123',
      lastMessage: undefined,
    });

    await consumeStream({
      stream: processUIMessageStream({
        stream,
        onToolCall: async () => {
          onToolCallInvoked = true;
        },
        runUpdateMessageJob,
        onError: error => {
          throw error;
        },
      }),
    });

    expect(onToolCallInvoked).toBe(true);

    expect(state.message.parts).toMatchInlineSnapshot(`
      [
        {
          "type": "step-start",
        },
        {
          "errorText": undefined,
          "input": {
            "query": "test",
          },
          "output": undefined,
          "preliminary": undefined,
          "providerExecuted": undefined,
          "rawInput": undefined,
          "state": "input-available",
          "title": undefined,
          "toolCallId": "tool-call-id",
          "type": "tool-tool-name",
          "yields": undefined,
        },
      ]
    `);
  });

  describe('dynamic tools', () => {
    let onToolCallInvoked: boolean;

    beforeEach(async () => {
      onToolCallInvoked = false;

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-start',
          toolCallId: 'tool-call-1',
          toolName: 't1',
          dynamic: true,
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-call-1',
          inputTextDelta: '{ "query": "test" }',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 't1',
          input: { query: 'test' },
          dynamic: true,
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-2',
          toolName: 't1',
          input: { query: 'test' },
          dynamic: true,
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-1',
          output: { result: 'provider-result' },
          dynamic: true,
        },
        {
          type: 'tool-output-error',
          toolCallId: 'tool-call-2',
          errorText: 'error-text',
          dynamic: true,
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          onToolCall: () => {
            onToolCallInvoked = true;
          },
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should invoke onToolCall for dynamic tools', async () => {
      expect(onToolCallInvoked).toBe(true);
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": {
                    "result": "provider-result",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "errorText": "error-text",
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": undefined,
            "input": {
              "query": "test",
            },
            "output": {
              "result": "provider-result",
            },
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-available",
            "title": undefined,
            "toolCallId": "tool-call-1",
            "toolName": "t1",
            "type": "dynamic-tool",
            "yields": [],
          },
          {
            "errorText": "error-text",
            "input": {
              "query": "test",
            },
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-error",
            "title": undefined,
            "toolCallId": "tool-call-2",
            "toolName": "t1",
            "type": "dynamic-tool",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  describe('provider metadata', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'text-start',
          id: '1',
          providerMetadata: { testProvider: { signature: '1' } },
        },
        {
          type: 'text-delta',
          id: '1',
          delta: 'Hello',
        },
        {
          type: 'text-delta',
          id: '1',
          delta: ', ',
        },
        {
          type: 'text-delta',
          id: '1',
          delta: 'world!',
        },
        {
          type: 'text-end',
          id: '1',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-id',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerMetadata: { testProvider: { signature: '2' } },
        },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
              "parts": [],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "streaming",
                  "text": "",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "streaming",
                  "text": "Hello",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "streaming",
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "streaming",
                  "text": "Hello, world!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
                },
                {
                  "callProviderMetadata": {
                    "testProvider": {
                      "signature": "2",
                    },
                  },
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "providerMetadata": {
                    "testProvider": {
                      "signature": "1",
                    },
                  },
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
                },
                {
                  "callProviderMetadata": {
                    "testProvider": {
                      "signature": "2",
                    },
                  },
                  "errorText": undefined,
                  "input": {
                    "query": "test",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "providerMetadata": {
              "testProvider": {
                "signature": "1",
              },
            },
            "state": "done",
            "text": "Hello, world!",
            "type": "text",
          },
          {
            "callProviderMetadata": {
              "testProvider": {
                "signature": "2",
              },
            },
            "errorText": undefined,
            "input": {
              "query": "test",
            },
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "input-available",
            "title": undefined,
            "toolCallId": "tool-call-id",
            "type": "tool-tool-name",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  describe('tool input error', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          toolCallId: 'call-1',
          toolName: 'cityAttractions',
          type: 'tool-input-start',
        },
        {
          inputTextDelta: '{ "cities": "San Francisco" }',
          toolCallId: 'call-1',
          type: 'tool-input-delta',
        },
        {
          errorText: 'Invalid input for tool cityAttractions',
          input: '{ "cities": "San Francisco" }',
          toolCallId: 'call-1',
          toolName: 'cityAttractions',
          type: 'tool-input-error',
        },
        {
          errorText: 'Invalid input for tool cityAttractions',
          toolCallId: 'call-1',
          type: 'tool-output-error',
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "cities": "San Francisco",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "Invalid input for tool cityAttractions",
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": "{ "cities": "San Francisco" }",
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "Invalid input for tool cityAttractions",
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": "{ "cities": "San Francisco" }",
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": "Invalid input for tool cityAttractions",
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": "{ "cities": "San Francisco" }",
                  "state": "output-error",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": "Invalid input for tool cityAttractions",
            "input": undefined,
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": "{ "cities": "San Francisco" }",
            "state": "output-error",
            "title": undefined,
            "toolCallId": "call-1",
            "type": "tool-cityAttractions",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  describe('preliminary tool results', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          input: {
            city: 'San Francisco',
          },
          toolCallId: 'call-1',
          toolName: 'cityAttractions',
          type: 'tool-input-available',
        },
        {
          output: {
            status: 'loading',
            text: 'Getting weather for San Francisco',
          },
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        {
          output: {
            status: 'success',
            temperature: 72,
            text: 'The weather in San Francisco is 72°F',
          },
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        {
          output: {
            status: 'success',
            temperature: 72,
            text: 'The weather in San Francisco is 72°F',
          },
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "San Francisco",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "San Francisco",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-streaming",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": [
                    {
                      "status": "loading",
                      "text": "Getting weather for San Francisco",
                    },
                  ],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "San Francisco",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-streaming",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": [
                    {
                      "status": "loading",
                      "text": "Getting weather for San Francisco",
                    },
                    {
                      "status": "success",
                      "temperature": 72,
                      "text": "The weather in San Francisco is 72°F",
                    },
                  ],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "San Francisco",
                  },
                  "output": {
                    "status": "success",
                    "temperature": 72,
                    "text": "The weather in San Francisco is 72°F",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": [
                    {
                      "status": "loading",
                      "text": "Getting weather for San Francisco",
                    },
                    {
                      "status": "success",
                      "temperature": 72,
                      "text": "The weather in San Francisco is 72°F",
                    },
                  ],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "city": "San Francisco",
                  },
                  "output": {
                    "status": "success",
                    "temperature": 72,
                    "text": "The weather in San Francisco is 72°F",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
                  "yields": [
                    {
                      "status": "loading",
                      "text": "Getting weather for San Francisco",
                    },
                    {
                      "status": "success",
                      "temperature": 72,
                      "text": "The weather in San Francisco is 72°F",
                    },
                  ],
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": undefined,
            "input": {
              "city": "San Francisco",
            },
            "output": {
              "status": "success",
              "temperature": 72,
              "text": "The weather in San Francisco is 72°F",
            },
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-available",
            "title": undefined,
            "toolCallId": "call-1",
            "type": "tool-cityAttractions",
            "yields": [
              {
                "status": "loading",
                "text": "Getting weather for San Francisco",
              },
              {
                "status": "success",
                "temperature": 72,
                "text": "The weather in San Francisco is 72°F",
              },
            ],
          },
        ]
      `);
    });
  });

  describe('tool output streaming with yields', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          input: {
            prompt: 'What is the weather in San Francisco?',
          },
          toolCallId: 'call-1',
          toolName: 'weather',
          type: 'tool-input-available',
        },
        // First preliminary yield
        {
          output: {
            state: 'loading',
            text: 'Doing a thing',
          },
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        // Second preliminary yield
        {
          output: {
            state: 'loading',
            text: 'Did another thing',
          },
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        // Final result
        {
          output: {
            data: 'some result here',
          },
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function with output-streaming state and yields', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "msg-123",
              "metadata": undefined,
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
              "metadata": undefined,
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "prompt": "What is the weather in San Francisco?",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "prompt": "What is the weather in San Francisco?",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-streaming",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                  "yields": [
                    {
                      "state": "loading",
                      "text": "Doing a thing",
                    },
                  ],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "prompt": "What is the weather in San Francisco?",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-streaming",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                  "yields": [
                    {
                      "state": "loading",
                      "text": "Doing a thing",
                    },
                    {
                      "state": "loading",
                      "text": "Did another thing",
                    },
                  ],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "prompt": "What is the weather in San Francisco?",
                  },
                  "output": {
                    "data": "some result here",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                  "yields": [
                    {
                      "state": "loading",
                      "text": "Doing a thing",
                    },
                    {
                      "state": "loading",
                      "text": "Did another thing",
                    },
                  ],
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "prompt": "What is the weather in San Francisco?",
                  },
                  "output": {
                    "data": "some result here",
                  },
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-weather",
                  "yields": [
                    {
                      "state": "loading",
                      "text": "Doing a thing",
                    },
                    {
                      "state": "loading",
                      "text": "Did another thing",
                    },
                  ],
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state with yields', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": undefined,
            "input": {
              "prompt": "What is the weather in San Francisco?",
            },
            "output": {
              "data": "some result here",
            },
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-available",
            "title": undefined,
            "toolCallId": "call-1",
            "type": "tool-weather",
            "yields": [
              {
                "state": "loading",
                "text": "Doing a thing",
              },
              {
                "state": "loading",
                "text": "Did another thing",
              },
            ],
          },
        ]
      `);
    });

    it('should have output-streaming state with yields for preliminary results', async () => {
      // Check that we have output-streaming states in the write calls
      const streamingStates = writeCalls
        .flatMap(call => call.message.parts)
        .filter(
          part =>
            isToolUIPart(part) &&
            part.toolCallId === 'call-1' &&
            part.state === 'output-streaming',
        ) as Array<ToolUIPart & { state: 'output-streaming' }>;

      expect(streamingStates).toHaveLength(2);

      // First streaming state should have 1 yield
      const firstStreaming = streamingStates[0];
      expect(firstStreaming.yields).toEqual([
        {
          state: 'loading',
          text: 'Doing a thing',
        },
      ]);

      // Second streaming state should have 2 yields
      const secondStreaming = streamingStates[1];
      expect(secondStreaming.yields).toEqual([
        {
          state: 'loading',
          text: 'Doing a thing',
        },
        {
          state: 'loading',
          text: 'Did another thing',
        },
      ]);
    });

    it('should have output-available state with final output and all yields', async () => {
      const finalPart = state!.message.parts.find(
        part =>
          isToolUIPart(part) &&
          part.toolCallId === 'call-1' &&
          part.state === 'output-available',
      ) as ToolUIPart & { state: 'output-available' };

      expect(finalPart).toBeDefined();
      expect(finalPart.output).toEqual({
        data: 'some result here',
      });
      expect(finalPart.yields).toEqual([
        {
          state: 'loading',
          text: 'Doing a thing',
        },
        {
          state: 'loading',
          text: 'Did another thing',
        },
      ]);
    });
  });

  describe('dynamic tool output streaming with yields', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          input: {
            query: 'test',
          },
          toolCallId: 'call-1',
          toolName: 'dynamic-tool',
          type: 'tool-input-available',
          dynamic: true,
        },
        {
          output: {
            status: 'progress',
            message: 'Step 1',
          },
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
          dynamic: true,
        },
        {
          output: {
            status: 'progress',
            message: 'Step 2',
          },
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
          dynamic: true,
        },
        {
          output: {
            status: 'complete',
            result: 'final result',
          },
          toolCallId: 'call-1',
          type: 'tool-output-available',
          dynamic: true,
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should have output-streaming states with yields for dynamic tools', async () => {
      const streamingParts = writeCalls
        .flatMap(call => call.message.parts)
        .filter(
          part =>
            isDynamicToolUIPart(part) &&
            part.toolCallId === 'call-1' &&
            part.state === 'output-streaming',
        ) as Array<DynamicToolUIPart & { state: 'output-streaming' }>;

      expect(streamingParts).toHaveLength(2);
      expect(streamingParts[0].yields).toEqual([
        { status: 'progress', message: 'Step 1' },
      ]);
      expect(streamingParts[1].yields).toEqual([
        { status: 'progress', message: 'Step 1' },
        { status: 'progress', message: 'Step 2' },
      ]);
    });

    it('should have final output-available state with all yields for dynamic tools', async () => {
      const finalPart = state!.message.parts.find(
        part =>
          isDynamicToolUIPart(part) &&
          part.toolCallId === 'call-1' &&
          part.state === 'output-available',
      ) as DynamicToolUIPart & { state: 'output-available' };

      expect(finalPart).toBeDefined();
      expect(finalPart.output).toEqual({
        status: 'complete',
        result: 'final result',
      });
      expect(finalPart.yields).toEqual([
        { status: 'progress', message: 'Step 1' },
        { status: 'progress', message: 'Step 2' },
      ]);
    });
  });

  describe('tool title support', () => {
    describe('static tool with title', () => {
      beforeEach(async () => {
        const stream = createUIMessageStream([
          { type: 'start', messageId: 'msg-123' },
          { type: 'start-step' },
          {
            type: 'tool-input-start',
            toolCallId: 'tool-call-0',
            toolName: 'weatherTool',
            title: 'Weather Information',
          },
          {
            type: 'tool-input-delta',
            toolCallId: 'tool-call-0',
            inputTextDelta: '{"location":"Paris"}',
          },
          {
            type: 'tool-input-available',
            toolCallId: 'tool-call-0',
            toolName: 'weatherTool',
            input: { location: 'Paris' },
            title: 'Weather Information',
          },
          {
            type: 'tool-output-available',
            toolCallId: 'tool-call-0',
            output: 'Sunny, 22°C',
          },
          { type: 'finish-step' },
          { type: 'finish' },
        ]);

        state = createStreamingUIMessageState({
          messageId: 'msg-123',
          lastMessage: undefined,
        });

        await consumeStream({
          stream: processUIMessageStream({
            stream,
            runUpdateMessageJob,
            onError: error => {
              throw error;
            },
          }),
        });
      });

      it('should include title in tool invocation parts', () => {
        const toolPart = state!.message.parts.find(
          part => part.type === 'tool-weatherTool',
        );

        expect(toolPart).toBeDefined();
        expect((toolPart as any).title).toBe('Weather Information');
      });

      it('should preserve title through all states', () => {
        const inputStreamingWrite = writeCalls.find(call =>
          call.message.parts.some(
            part =>
              part.type === 'tool-weatherTool' &&
              (part as any).state === 'input-streaming',
          ),
        );
        expect(
          (
            inputStreamingWrite!.message.parts.find(
              part => part.type === 'tool-weatherTool',
            ) as any
          ).title,
        ).toBe('Weather Information');

        const inputAvailableWrite = writeCalls.find(call =>
          call.message.parts.some(
            part =>
              part.type === 'tool-weatherTool' &&
              (part as any).state === 'input-available',
          ),
        );
        expect(
          (
            inputAvailableWrite!.message.parts.find(
              part => part.type === 'tool-weatherTool',
            ) as any
          ).title,
        ).toBe('Weather Information');

        const outputAvailableWrite = writeCalls.find(call =>
          call.message.parts.some(
            part =>
              part.type === 'tool-weatherTool' &&
              (part as any).state === 'output-available',
          ),
        );
        expect(
          (
            outputAvailableWrite!.message.parts.find(
              part => part.type === 'tool-weatherTool',
            ) as any
          ).title,
        ).toBe('Weather Information');
      });
    });

    describe('dynamic tool with title', () => {
      beforeEach(async () => {
        const stream = createUIMessageStream([
          { type: 'start', messageId: 'msg-456' },
          { type: 'start-step' },
          {
            type: 'tool-input-start',
            toolCallId: 'tool-call-1',
            toolName: 'calculate',
            dynamic: true,
            title: 'Calculator',
          },
          {
            type: 'tool-input-delta',
            toolCallId: 'tool-call-1',
            inputTextDelta: '{"a":5,"b":3}',
          },
          {
            type: 'tool-input-available',
            toolCallId: 'tool-call-1',
            toolName: 'calculate',
            input: { a: 5, b: 3 },
            dynamic: true,
            title: 'Calculator',
          },
          {
            type: 'tool-output-available',
            toolCallId: 'tool-call-1',
            output: { result: 8 },
            dynamic: true,
          },
          { type: 'finish-step' },
          { type: 'finish' },
        ]);

        state = createStreamingUIMessageState({
          messageId: 'msg-456',
          lastMessage: undefined,
        });

        await consumeStream({
          stream: processUIMessageStream({
            stream,
            runUpdateMessageJob,
            onError: error => {
              throw error;
            },
          }),
        });
      });

      it('should include title in dynamic tool invocation', () => {
        const toolPart = state!.message.parts.find(
          part => part.type === 'dynamic-tool',
        );

        expect(toolPart).toBeDefined();
        expect((toolPart as any).title).toBe('Calculator');
        expect((toolPart as any).toolName).toBe('calculate');
      });

      it('should maintain title through dynamic tool states', () => {
        const finalToolPart = state!.message.parts.find(
          part => part.type === 'dynamic-tool',
        ) as any;

        expect(finalToolPart.state).toBe('output-available');
        expect(finalToolPart.title).toBe('Calculator');
        expect(finalToolPart.input).toEqual({ a: 5, b: 3 });
        expect(finalToolPart.output).toEqual({ result: 8 });
      });
    });

    describe('tool with title in error state', () => {
      beforeEach(async () => {
        const stream = createUIMessageStream([
          { type: 'start', messageId: 'msg-error' },
          { type: 'start-step' },
          {
            type: 'tool-input-start',
            toolCallId: 'tool-call-error',
            toolName: 'errorTool',
            title: 'Error Tool',
          },
          {
            type: 'tool-input-available',
            toolCallId: 'tool-call-error',
            toolName: 'errorTool',
            input: { invalid: 'data' },
            title: 'Error Tool',
          },
          {
            type: 'tool-output-error',
            toolCallId: 'tool-call-error',
            errorText: 'Tool execution failed',
          },
          { type: 'finish-step' },
          { type: 'finish' },
        ]);

        state = createStreamingUIMessageState({
          messageId: 'msg-error',
          lastMessage: undefined,
        });

        await consumeStream({
          stream: processUIMessageStream({
            stream,
            runUpdateMessageJob,
            onError: error => {
              throw error;
            },
          }),
        });
      });

      it('should preserve title even in error state', () => {
        const toolPart = state!.message.parts.find(
          part => part.type === 'tool-errorTool',
        );

        expect(toolPart).toBeDefined();
        expect((toolPart as any).title).toBe('Error Tool');
        expect((toolPart as any).state).toBe('output-error');
        expect((toolPart as any).errorText).toBe('Tool execution failed');
      });
    });
  });

  describe('tool approval requests (static tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          input: {
            value: 'value',
          },
          toolCallId: 'call-1',
          toolName: 'tool1',
          type: 'tool-input-available',
        },
        {
          approvalId: 'id-1',
          toolCallId: 'call-1',
          type: 'tool-approval-request',
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "approval": {
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "approval-requested",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "approval": {
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "approval-requested",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "id": "id-1",
            },
            "errorText": undefined,
            "input": {
              "value": "value",
            },
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "approval-requested",
            "title": undefined,
            "toolCallId": "call-1",
            "type": "tool-tool1",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  describe('tool approval requests (dynamic tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        {
          type: 'start',
        },
        {
          type: 'start-step',
        },
        {
          input: {
            value: 'value',
          },
          toolCallId: 'call-1',
          toolName: 'tool1',
          type: 'tool-input-available',
          dynamic: true,
        },
        {
          approvalId: 'id-1',
          toolCallId: 'call-1',
          type: 'tool-approval-request',
        },
        {
          type: 'finish-step',
        },
        {
          type: 'finish',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
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
                  "type": "step-start",
                },
                {
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "input-available",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "approval": {
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "approval-requested",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": undefined,
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
                  "type": "step-start",
                },
                {
                  "approval": {
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "approval-requested",
                  "title": undefined,
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": undefined,
                },
              ],
              "role": "assistant",
            },
          },
        ]
      `);
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "id": "id-1",
            },
            "errorText": undefined,
            "input": {
              "value": "value",
            },
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": undefined,
            "state": "approval-requested",
            "title": undefined,
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "dynamic-tool",
            "yields": undefined,
          },
        ]
      `);
    });
  });

  describe('initial tool execution after approval (static tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start' },
        // initial tool execution:
        {
          output: 'result1',
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        // rest of the step:
        { type: 'start-step' },
        { id: '1', type: 'text-start' },
        {
          delta: 'Hello, world!',
          id: '1',
          type: 'text-delta',
        },
        { id: '1', type: 'text-end' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          parts: [
            { type: 'step-start' },
            {
              approval: { id: 'id-1', approved: true },
              input: { value: 'value' },
              rawInput: undefined,
              state: 'approval-responded',
              toolCallId: 'call-1',
              type: 'tool-tool1',
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [],
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [],
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
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "approved": true,
              "id": "id-1",
            },
            "errorText": undefined,
            "input": {
              "value": "value",
            },
            "output": "result1",
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-available",
            "toolCallId": "call-1",
            "type": "tool-tool1",
            "yields": [],
          },
          {
            "type": "step-start",
          },
          {
            "providerMetadata": undefined,
            "state": "done",
            "text": "Hello, world!",
            "type": "text",
          },
        ]
      `);
    });
  });

  describe('initial tool execution after approval (dynamic tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start' },
        // initial tool execution:
        {
          output: 'result1',
          toolCallId: 'call-1',
          type: 'tool-output-available',
          dynamic: true,
        },
        // rest of the step:
        { type: 'start-step' },
        { id: '1', type: 'text-start' },
        {
          delta: 'Hello, world!',
          id: '1',
          type: 'text-delta',
        },
        { id: '1', type: 'text-end' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          parts: [
            { type: 'step-start' },
            {
              approval: { id: 'id-1', approved: true },
              input: { value: 'value' },
              state: 'approval-responded',
              toolCallId: 'call-1',
              type: 'dynamic-tool',
              toolName: 'tool1',
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": [],
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
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "result1",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                  "yields": [],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "approved": true,
              "id": "id-1",
            },
            "errorText": undefined,
            "input": {
              "value": "value",
            },
            "output": "result1",
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-available",
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "dynamic-tool",
            "yields": [],
          },
          {
            "type": "step-start",
          },
          {
            "providerMetadata": undefined,
            "state": "done",
            "text": "Hello, world!",
            "type": "text",
          },
        ]
      `);
    });
  });

  describe('initial tool execution with preliminary results after approval (static tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start' },
        // initial tool execution:
        {
          output: 'preliminary-result',
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        {
          output: 'final-result',
          preliminary: true,
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        {
          output: 'final-result',
          toolCallId: 'call-1',
          type: 'tool-output-available',
        },
        // rest of the step:
        { type: 'start-step' },
        { id: '1', type: 'text-start' },
        {
          delta: 'Hello, world!',
          id: '1',
          type: 'text-delta',
        },
        { id: '1', type: 'text-end' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          parts: [
            { type: 'step-start' },
            {
              approval: { id: 'id-1', approved: true },
              input: { value: 'value' },
              rawInput: undefined,
              state: 'approval-responded',
              toolCallId: 'call-1',
              type: 'tool-tool1',
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-streaming",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                  ],
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-streaming",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "final-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "final-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
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
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "final-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "final-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "final-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": true,
                    "id": "id-1",
                  },
                  "errorText": undefined,
                  "input": {
                    "value": "value",
                  },
                  "output": "final-result",
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                  "yields": [
                    "preliminary-result",
                    "final-result",
                  ],
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
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
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "approved": true,
              "id": "id-1",
            },
            "errorText": undefined,
            "input": {
              "value": "value",
            },
            "output": "final-result",
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-available",
            "toolCallId": "call-1",
            "type": "tool-tool1",
            "yields": [
              "preliminary-result",
              "final-result",
            ],
          },
          {
            "type": "step-start",
          },
          {
            "providerMetadata": undefined,
            "state": "done",
            "text": "Hello, world!",
            "type": "text",
          },
        ]
      `);
    });
  });

  describe('tool execution denial (static tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start' },
        // tool execution denial:
        {
          toolCallId: 'call-1',
          type: 'tool-output-denied',
        },
        // rest of the step:
        { type: 'start-step' },
        { id: '1', type: 'text-start' },
        { id: '1', type: 'text-delta', delta: 'I did not execute the tool.' },
        { id: '1', type: 'text-end' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          parts: [
            { type: 'step-start' },
            {
              approval: { id: 'id-1', approved: false },
              input: { value: 'value' },
              rawInput: undefined,
              state: 'approval-responded',
              toolCallId: 'call-1',
              type: 'tool-tool1',
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
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
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "I did not execute the tool.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I did not execute the tool.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "type": "tool-tool1",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I did not execute the tool.",
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
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "approved": false,
              "id": "id-1",
            },
            "input": {
              "value": "value",
            },
            "rawInput": undefined,
            "state": "output-denied",
            "toolCallId": "call-1",
            "type": "tool-tool1",
          },
          {
            "type": "step-start",
          },
          {
            "providerMetadata": undefined,
            "state": "done",
            "text": "I did not execute the tool.",
            "type": "text",
          },
        ]
      `);
    });
  });

  describe('tool execution denial (dynamic tool)', () => {
    beforeEach(async () => {
      const stream = createUIMessageStream([
        { type: 'start' },
        // tool execution denial:
        {
          toolCallId: 'call-1',
          type: 'tool-output-denied',
        },
        // rest of the step:
        { type: 'start-step' },
        { id: '1', type: 'text-start' },
        { id: '1', type: 'text-delta', delta: 'I did not execute the tool.' },
        { id: '1', type: 'text-end' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: {
          role: 'assistant',
          id: 'original-id',
          parts: [
            { type: 'step-start' },
            {
              approval: { id: 'id-1', approved: false },
              input: { value: 'value' },
              rawInput: undefined,
              state: 'approval-responded',
              toolCallId: 'call-1',
              type: 'dynamic-tool',
              toolName: 'tool1',
            },
          ],
        },
      });

      await consumeStream({
        stream: processUIMessageStream({
          stream,
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });
    });

    it('should call the update function with the correct arguments', async () => {
      expect(writeCalls).toMatchInlineSnapshot(`
        [
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
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
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "streaming",
                  "text": "I did not execute the tool.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I did not execute the tool.",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          },
          {
            "message": {
              "id": "original-id",
              "parts": [
                {
                  "type": "step-start",
                },
                {
                  "approval": {
                    "approved": false,
                    "id": "id-1",
                  },
                  "input": {
                    "value": "value",
                  },
                  "rawInput": undefined,
                  "state": "output-denied",
                  "toolCallId": "call-1",
                  "toolName": "tool1",
                  "type": "dynamic-tool",
                },
                {
                  "type": "step-start",
                },
                {
                  "providerMetadata": undefined,
                  "state": "done",
                  "text": "I did not execute the tool.",
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
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "approval": {
              "approved": false,
              "id": "id-1",
            },
            "input": {
              "value": "value",
            },
            "rawInput": undefined,
            "state": "output-denied",
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "dynamic-tool",
          },
          {
            "type": "step-start",
          },
          {
            "providerMetadata": undefined,
            "state": "done",
            "text": "I did not execute the tool.",
            "type": "text",
          },
        ]
      `);
    });
  });
});
