import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { consumeStream } from '../util/consume-stream';
import {
  type StreamingUIMessageState,
  type UIMessageStreamWriteOptions,
  createStreamingUIMessageState,
  processUIMessageStream,
} from './process-ui-message-stream';
<<<<<<< HEAD
import type { InferUIMessageData, UIMessage } from './ui-messages';
import { beforeEach, describe, it, expect, vi } from 'vitest';
=======
import {
  isToolUIPart,
  type InferUIMessageData,
  type UIMessage,
} from './ui-messages';
import { validateUIMessages } from './validate-ui-messages';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { UIMessageStreamError } from '../error/ui-message-stream-error';
>>>>>>> c5e90bb137 (fix: resume hydrated partial static tool calls without losing streaming state (#21480))

function createUIMessageStream(parts: UIMessageChunk[]) {
  return convertArrayToReadableStream(parts);
}

type ObjectPrototypeState = {
  input?: unknown;
  providerMetadata?: unknown;
  state?: unknown;
  text?: unknown;
};

function clearObjectPrototypeState() {
  const objectPrototype = Object.prototype as ObjectPrototypeState;
  delete objectPrototype.input;
  delete objectPrototype.providerMetadata;
  delete objectPrototype.state;
  delete objectPrototype.text;
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
      write: (options?: UIMessageStreamWriteOptions) => void;
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

  describe('prototype pollution protection', () => {
    it('should not read Object.prototype for missing text part ids', async () => {
      clearObjectPrototypeState();

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text-delta', id: '__proto__', delta: 'Hello' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      try {
        await expect(
          consumeStream({
            stream: processUIMessageStream({
              stream,
              runUpdateMessageJob,
              onError: error => {
                throw error;
              },
            }),
            onError: error => {
              throw error;
            },
          }),
        ).rejects.toThrow(TypeError);

        expect(Object.hasOwn(Object.prototype, 'providerMetadata')).toBe(false);
        expect(Object.hasOwn(Object.prototype, 'text')).toBe(false);
      } finally {
        clearObjectPrototypeState();
      }
    });

    it('should not read Object.prototype for missing reasoning part ids', async () => {
      clearObjectPrototypeState();

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'reasoning-delta', id: '__proto__', delta: 'Thinking...' },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      try {
        await expect(
          consumeStream({
            stream: processUIMessageStream({
              stream,
              runUpdateMessageJob,
              onError: error => {
                throw error;
              },
            }),
            onError: error => {
              throw error;
            },
          }),
        ).rejects.toThrow(TypeError);

        expect(Object.hasOwn(Object.prototype, 'providerMetadata')).toBe(false);
        expect(Object.hasOwn(Object.prototype, 'text')).toBe(false);
      } finally {
        clearObjectPrototypeState();
      }
    });

    it('should not read Object.prototype for missing partial tool call ids', async () => {
      clearObjectPrototypeState();

      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-delta',
          toolCallId: '__proto__',
          inputTextDelta: '{"key":',
        },
      ]);

      state = createStreamingUIMessageState({
        messageId: 'msg-123',
        lastMessage: undefined,
      });

      try {
        await expect(
          consumeStream({
            stream: processUIMessageStream({
              stream,
              runUpdateMessageJob,
              onError: error => {
                throw error;
              },
            }),
            onError: error => {
              throw error;
            },
          }),
        ).rejects.toThrow(TypeError);

        expect(Object.hasOwn(Object.prototype, 'input')).toBe(false);
        expect(Object.hasOwn(Object.prototype, 'text')).toBe(false);
      } finally {
        clearObjectPrototypeState();
      }
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
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
                {
                  "id": "reasoning-1",
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
                  "id": "reasoning-1",
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
                  "id": "reasoning-1",
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
                  "id": "reasoning-1",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                },
                {
                  "type": "step-start",
                },
                {
                  "id": "reasoning-2",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                },
                {
                  "type": "step-start",
                },
                {
                  "id": "reasoning-2",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                },
                {
                  "type": "step-start",
                },
                {
                  "id": "reasoning-2",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                },
                {
                  "type": "step-start",
                },
                {
                  "id": "reasoning-2",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                },
                {
                  "type": "step-start",
                },
                {
                  "id": "reasoning-2",
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
                  "id": "reasoning-1",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
                },
                {
                  "type": "step-start",
                },
                {
                  "id": "reasoning-2",
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
                          "id": "reasoning-1",
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
                          "toolCallId": "tool-call-id",
                          "type": "tool-tool-name",
                        },
                        {
                          "type": "step-start",
                        },
                        {
                          "id": "reasoning-2",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
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
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
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
                  "rawInput": "{"testArg":"t",
                  "state": "input-streaming",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
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
                  "rawInput": "{"testArg":"test-value"}}",
                  "state": "input-streaming",
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
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
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
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
                  "toolCallId": "tool-call-0",
                  "type": "tool-test-tool",
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
              "toolCallId": "tool-call-0",
              "type": "tool-test-tool",
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
                  {
                    "id": "reasoning-1",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                    "id": "reasoning-1",
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
                    "id": "reasoning-2",
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
                    "id": "reasoning-3",
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
                            "id": "reasoning-1",
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
                            "id": "reasoning-2",
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
                            "id": "reasoning-3",
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

    it('should preserve reasoning part ids', () => {
      expect(
        state!.message.parts
          .filter(part => part.type === 'reasoning')
          .map(part => part.id),
      ).toEqual(['reasoning-1', 'reasoning-2', 'reasoning-3']);
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
              "toolCallId": "tool-call-id",
              "type": "tool-tool-name",
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

  describe('provider-executed tools', () => {
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
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": true,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
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
                  "rawInput": "{ "query": "test" }",
                  "state": "input-streaming",
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-2",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-1",
                  "type": "tool-tool-name",
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
                  "toolCallId": "tool-call-2",
                  "type": "tool-tool-name",
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
            "toolCallId": "tool-call-1",
            "type": "tool-tool-name",
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
            "toolCallId": "tool-call-2",
            "type": "tool-tool-name",
          },
        ]
      `);
    });
<<<<<<< HEAD
=======

    it('should preserve separate call and result provider metadata for static tools', async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerExecuted: true,
          providerMetadata: { testProvider: { itemId: 'call-item' } },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-1',
          output: { result: 'provider-result' },
          providerExecuted: true,
          providerMetadata: { testProvider: { itemId: 'result-item' } },
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

      const toolPart = state!.message.parts.find(
        (part: any) => part.toolCallId === 'tool-call-1',
      ) as any;

      expect(toolPart.callProviderMetadata).toEqual({
        testProvider: { itemId: 'call-item' },
      });
      expect(toolPart.resultProviderMetadata).toEqual({
        testProvider: { itemId: 'result-item' },
      });
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
                  "rawInput": "{ "query": "test" }",
                  "state": "input-streaming",
                  "title": undefined,
                  "toolCallId": "tool-call-1",
                  "toolName": "tool-name",
                  "type": "dynamic-tool",
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
          },
        ]
      `);
    });

    it('should preserve separate call and result provider metadata for dynamic tools', async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          input: { query: 'test' },
          providerExecuted: true,
          dynamic: true,
          providerMetadata: { testProvider: { itemId: 'call-item' } },
        },
        {
          type: 'tool-output-error',
          toolCallId: 'tool-call-1',
          errorText: 'error-text',
          providerExecuted: true,
          dynamic: true,
          providerMetadata: { testProvider: { itemId: 'result-item' } },
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

      const toolPart = state!.message.parts.find(
        (part: any) => part.toolCallId === 'tool-call-1',
      ) as any;

      expect(toolPart.callProviderMetadata).toEqual({
        testProvider: { itemId: 'call-item' },
      });
      expect(toolPart.resultProviderMetadata).toEqual({
        testProvider: { itemId: 'result-item' },
      });
    });

    it('should preserve tool metadata on dynamic tool parts', async () => {
      const stream = createUIMessageStream([
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-call-1',
          toolName: 'tool-name',
          input: { query: 'test' },
          dynamic: true,
          toolMetadata: { clientName: 'MyMCPClient' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-call-1',
          output: { result: 'provider-result' },
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
          runUpdateMessageJob,
          onError: error => {
            throw error;
          },
        }),
      });

      const toolPart = state!.message.parts.find(
        (part: any) => part.toolCallId === 'tool-call-1',
      ) as any;

      expect(toolPart).toMatchInlineSnapshot(`
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
          "toolMetadata": {
            "clientName": "MyMCPClient",
          },
          "toolName": "tool-name",
          "type": "dynamic-tool",
        }
      `);
    });
  });

  it('should apply output chunk tool metadata to static and dynamic tool parts', async () => {
    const stream = createUIMessageStream([
      { type: 'start', messageId: 'msg-123' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'dynamic-success',
        toolName: 'tool-name',
        input: { query: 'test' },
        dynamic: true,
      },
      {
        type: 'tool-output-available',
        toolCallId: 'dynamic-success',
        output: { result: 'provider-result' },
        dynamic: true,
        toolMetadata: { phase: 'dynamic-output-available' },
      },
      {
        type: 'tool-input-available',
        toolCallId: 'dynamic-error',
        toolName: 'tool-name',
        input: { query: 'test' },
        dynamic: true,
        toolMetadata: { phase: 'dynamic-input' },
      },
      {
        type: 'tool-output-error',
        toolCallId: 'dynamic-error',
        errorText: 'error-text',
        dynamic: true,
        toolMetadata: { phase: 'dynamic-output-error' },
      },
      {
        type: 'tool-input-available',
        toolCallId: 'static-success',
        toolName: 'tool-name',
        input: { query: 'test' },
      },
      {
        type: 'tool-output-available',
        toolCallId: 'static-success',
        output: { result: 'provider-result' },
        toolMetadata: { phase: 'static-output-available' },
      },
      {
        type: 'tool-input-available',
        toolCallId: 'static-error',
        toolName: 'tool-name',
        input: { query: 'test' },
        toolMetadata: { phase: 'static-input' },
      },
      {
        type: 'tool-output-error',
        toolCallId: 'static-error',
        errorText: 'error-text',
        toolMetadata: { phase: 'static-output-error' },
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

    expect(
      state.message.parts.filter(isToolUIPart).map(part => ({
        toolCallId: part.toolCallId,
        state: part.state,
        toolMetadata: part.toolMetadata,
      })),
    ).toEqual([
      {
        toolCallId: 'dynamic-success',
        state: 'output-available',
        toolMetadata: { phase: 'dynamic-output-available' },
      },
      {
        toolCallId: 'dynamic-error',
        state: 'output-error',
        toolMetadata: { phase: 'dynamic-output-error' },
      },
      {
        toolCallId: 'static-success',
        state: 'output-available',
        toolMetadata: { phase: 'static-output-available' },
      },
      {
        toolCallId: 'static-error',
        state: 'output-error',
        toolMetadata: { phase: 'static-output-error' },
      },
    ]);
>>>>>>> c5e90bb137 (fix: resume hydrated partial static tool calls without losing streaming state (#21480))
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
          "toolCallId": "tool-call-id",
          "type": "tool-tool-name",
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
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "state": "input-streaming",
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "rawInput": "{ "query": "test" }",
                  "state": "input-streaming",
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-1",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-2",
                  "toolName": "t1",
                  "type": "dynamic-tool",
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
            "toolCallId": "tool-call-1",
            "toolName": "t1",
            "type": "dynamic-tool",
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
            "toolCallId": "tool-call-2",
            "toolName": "t1",
            "type": "dynamic-tool",
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
                  "toolCallId": "tool-call-id",
                  "type": "tool-tool-name",
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
            "toolCallId": "tool-call-id",
            "type": "tool-tool-name",
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
                {
                  "errorText": undefined,
                  "input": undefined,
                  "output": undefined,
                  "preliminary": undefined,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "input-streaming",
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
                  "rawInput": "{ "cities": "San Francisco" }",
                  "state": "input-streaming",
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
            "toolCallId": "call-1",
            "type": "tool-cityAttractions",
          },
        ]
      `);
    });
  });

<<<<<<< HEAD
=======
  describe('dynamic tool errors after input streaming', () => {
    const terminalChunks: Array<{
      name: string;
      chunk: UIMessageChunk;
    }> = [
      {
        name: 'tool input error',
        chunk: {
          type: 'tool-input-error',
          toolCallId: 'call-1',
          toolName: 'cityAttractions',
          input: { cities: ['San Francisco'] },
          errorText: 'Invalid input for tool cityAttractions',
          dynamic: true,
        },
      },
      {
        name: 'tool output error',
        chunk: {
          type: 'tool-output-error',
          toolCallId: 'call-1',
          errorText: 'Tool execution failed',
          dynamic: true,
        },
      },
    ];

    it.each(terminalChunks)(
      'clears raw input on $name',
      async ({ chunk: terminalChunk }) => {
        const warningLogger = vi.fn();
        globalThis.AI_SDK_LOG_WARNINGS = warningLogger;

        const stream = createUIMessageStream([
          { type: 'start' },
          { type: 'start-step' },
          {
            type: 'tool-input-start',
            toolCallId: 'call-1',
            toolName: 'cityAttractions',
            dynamic: true,
          },
          {
            type: 'tool-input-delta',
            toolCallId: 'call-1',
            inputTextDelta: '{ "cities": ["San Francisco"] }',
          },
          terminalChunk,
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

        const toolPart = state.message.parts.find(
          (part: any) => part.toolCallId === 'call-1',
        );

        expect(toolPart).toMatchObject({
          type: 'dynamic-tool',
          state: 'output-error',
        });
        expect((toolPart as any).rawInput).toBeUndefined();

        await validateUIMessages({ messages: [state.message] });

        expect(warningLogger).not.toHaveBeenCalled();
      },
    );
  });

  describe('tool input error with dynamic flag mismatch', () => {
    // Regression: when tool-input-start creates a static part (dynamic is
    // undefined because the tool isn't in the tools object) and tool-input-error
    // arrives with dynamic: true (from parseToolCall's catch for NoSuchToolError),
    // the error should update the existing static part instead of creating a
    // second dynamic-tool part.
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
          toolName: 'nonExistentTool',
          type: 'tool-input-start',
          // dynamic is NOT set (undefined) — this is what happens when the
          // tool isn't in the tools object and the provider doesn't set it
        },
        {
          inputTextDelta: '{ "foo": "bar" }',
          toolCallId: 'call-1',
          type: 'tool-input-delta',
        },
        {
          errorText: "Model tried to call unavailable tool 'nonExistentTool'.",
          input: '{ "foo": "bar" }',
          toolCallId: 'call-1',
          toolName: 'nonExistentTool',
          type: 'tool-input-error',
          // dynamic IS set to true — this is what parseToolCall returns for
          // invalid tool calls (NoSuchToolError catch)
          dynamic: true,
        },
        {
          errorText: "Model tried to call unavailable tool 'nonExistentTool'.",
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

    it('should produce exactly one tool part (no duplicate)', async () => {
      const toolParts = state!.message.parts.filter(
        (p: any) => p.toolCallId === 'call-1',
      );
      expect(toolParts).toHaveLength(1);
    });

    it('should keep the static tool type from tool-input-start', async () => {
      const toolPart = state!.message.parts.find(
        (p: any) => p.toolCallId === 'call-1',
      ) as any;
      expect(toolPart.type).toBe('tool-nonExistentTool');
    });

    it('should have the correct final message state', async () => {
      expect(state!.message.parts).toMatchInlineSnapshot(`
        [
          {
            "type": "step-start",
          },
          {
            "errorText": "Model tried to call unavailable tool 'nonExistentTool'.",
            "input": "{ "foo": "bar" }",
            "output": undefined,
            "preliminary": undefined,
            "providerExecuted": undefined,
            "rawInput": undefined,
            "state": "output-error",
            "title": undefined,
            "toolCallId": "call-1",
            "type": "tool-nonExistentTool",
          },
        ]
      `);
    });
  });

>>>>>>> c5e90bb137 (fix: resume hydrated partial static tool calls without losing streaming state (#21480))
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
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
                    "status": "loading",
                    "text": "Getting weather for San Francisco",
                  },
                  "preliminary": true,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
                  "preliminary": true,
                  "providerExecuted": undefined,
                  "rawInput": undefined,
                  "state": "output-available",
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
                  "toolCallId": "call-1",
                  "type": "tool-cityAttractions",
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
            "toolCallId": "call-1",
            "type": "tool-cityAttractions",
          },
        ]
      `);
    });
  });
});
