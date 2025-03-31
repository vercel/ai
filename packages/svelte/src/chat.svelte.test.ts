import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart, type Message } from '@ai-sdk/ui-utils';
import { render } from '@testing-library/svelte';
import { Chat } from './chat.svelte.js';
import ChatSynchronization from './tests/chat-synchronization.svelte';
import { promiseWithResolvers } from './utils.svelte.js';

function createFileList(...files: File[]): FileList {
  // file lists are really hard to create :(
  const input = document.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('name', 'file-upload');
  input.multiple = true;
  const fileList: FileList = Object.create(input.files);
  for (let i = 0; i < files.length; i++) {
    fileList[i] = files[i];
  }
  Object.defineProperty(fileList, 'length', { value: files.length });
  return fileList;
}

const server = createTestServer({
  '/api/chat': {},
});

describe('data protocol stream', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat();
  });

  it('should correctly manage streamed response in messages', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    await chat.append({ role: 'user', content: 'hi' });
    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello, world.',
      }),
    );
  });

  it('should correctly manage streamed response in data', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['2:[{"t1":"v1"}]\n', '2:[{"t1": "v2"}]\n', '0:"Hello"\n'],
    };

    await chat.append({ role: 'user', content: 'hi' });
    expect(chat.data).toStrictEqual([{ t1: 'v1' }, { t1: 'v2' }]);

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello',
      }),
    );
  });

  it('should clear data', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
    };

    await chat.append({ role: 'user', content: 'hi' });
    expect(chat.data).toStrictEqual([{ t1: 'v1' }]);
    chat.data = undefined;
    expect(chat.data).toBeUndefined();
  });

  it('should show error response when there is a server error', async () => {
    server.urls['/api/chat'].response = {
      type: 'error',
      status: 404,
      body: 'Not found',
    };

    await chat.append({ role: 'user', content: 'hi' });
    expect(chat.error).toBeInstanceOf(Error);
    expect(chat.error?.message).toBe('Not found');
  });

  it('should show error response when there is a streaming error', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['3:"custom error message"\n'],
    };

    await chat.append({ role: 'user', content: 'hi' });
    expect(chat.error).toBeInstanceOf(Error);
    expect(chat.error?.message).toBe('custom error message');
  });

  describe('status', () => {
    it('should show status', async () => {
      const controller = new TestResponseController();
      server.urls['/api/chat'].response = {
        type: 'controlled-stream',
        controller,
      };

      const appendOperation = chat.append({ role: 'user', content: 'hi' });
      await vi.waitFor(() => expect(chat.status).toBe('submitted'));
      controller.write('0:"Hello"\n');
      await vi.waitFor(() => expect(chat.status).toBe('streaming'));
      controller.close();
      await appendOperation;
      expect(chat.status).toBe('ready');
    });

    it('should set status to error when there is a server error', async () => {
      server.urls['/api/chat'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      chat.append({ role: 'user', content: 'hi' });
      await vi.waitFor(() => expect(chat.status).toBe('error'));
    });
  });

  it('should invoke onFinish when the stream finishes', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatDataStreamPart('text', 'Hello'),
        formatDataStreamPart('text', ','),
        formatDataStreamPart('text', ' world'),
        formatDataStreamPart('text', '.'),
        formatDataStreamPart('finish_message', {
          finishReason: 'stop',
          usage: { completionTokens: 1, promptTokens: 3 },
        }),
      ],
    };

    const onFinish = vi.fn();
    const chatWithOnFinish = new Chat({
      onFinish,
    });
    await chatWithOnFinish.append({ role: 'user', content: 'hi' });

    expect(onFinish).toHaveBeenCalledExactlyOnceWith(
      {
        id: expect.any(String),
        createdAt: expect.any(Date),
        role: 'assistant',
        content: 'Hello, world.',
        parts: [{ text: 'Hello, world.', type: 'text' }],
      },
      {
        finishReason: 'stop',
        usage: {
          completionTokens: 1,
          promptTokens: 3,
          totalTokens: 4,
        },
      },
    );
  });

  describe('id', () => {
    it('should send the id to the server', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      };

      await chat.append({ role: 'user', content: 'hi' });

      expect(await server.calls[0].requestBody).toStrictEqual({
        id: chat.id,
        messages: [
          {
            role: 'user',
            content: 'hi',
            parts: [{ text: 'hi', type: 'text' }],
          },
        ],
      });
    });

    it('should clear out messages when the id changes', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      };

      let id = $state(crypto.randomUUID());
      const chatWithId = new Chat({
        get id() {
          return id;
        },
      });
      await chatWithId.append({ role: 'user', content: 'hi' });

      expect(chatWithId.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          role: 'assistant',
          content: 'Hello, world.',
        }),
      );

      id = crypto.randomUUID();

      expect(chatWithId.messages).toHaveLength(0);
    });

    it('should restore messages when the id changes back to an existing id', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      };

      let id = $state(crypto.randomUUID());
      const originalId = id;
      const chatWithId = new Chat({
        get id() {
          return id;
        },
      });
      await chatWithId.append({ role: 'user', content: 'hi' });

      expect(chatWithId.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          role: 'assistant',
          content: 'Hello, world.',
        }),
      );

      id = crypto.randomUUID();
      expect(chatWithId.messages).toHaveLength(0);
      id = originalId;
      expect(chatWithId.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          role: 'assistant',
          content: 'Hello, world.',
        }),
      );
    });
  });
});

describe('text stream', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat({ streamProtocol: 'text' });
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await chat.append({ role: 'user', content: 'hi' });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello, world.',
      }),
    );
  });

  it('should have stable message ids', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    const appendOperation = chat.append({ role: 'user', content: 'hi' });
    controller.write('He');

    await vi.waitFor(() =>
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          id: expect.any(String),
          role: 'assistant',
          content: 'He',
        }),
      ),
    );
    const id = chat.messages.at(1)?.id;

    controller.write('llo');
    controller.close();
    await appendOperation;

    expect(id).toBeDefined();
    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        id,
        role: 'assistant',
        content: 'Hello',
      }),
    );
  });

  it('should invoke onFinish when the stream finishes', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    const onFinish = vi.fn();
    const chatWithOnFinish = new Chat({
      streamProtocol: 'text',
      onFinish,
    });
    await chatWithOnFinish.append({ role: 'user', content: 'hi' });

    expect(onFinish).toHaveBeenCalledExactlyOnceWith(
      {
        id: expect.any(String),
        createdAt: expect.any(Date),
        role: 'assistant',
        content: 'Hello, world.',
        parts: [{ text: 'Hello, world.', type: 'text' }],
      },
      {
        finishReason: 'unknown',
        usage: {
          completionTokens: NaN,
          promptTokens: NaN,
          totalTokens: NaN,
        },
      },
    );
  });
});

describe('form actions', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat({ streamProtocol: 'text' });
  });

  it('should show streamed response using handleSubmit', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['Hello', ',', ' world', '.'],
      },
      {
        type: 'stream-chunks',
        chunks: ['How', ' can', ' I', ' help', ' you', '?'],
      },
    ];

    chat.input = 'hi';
    await chat.handleSubmit();

    expect(chat.input).toBe('');
    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello, world.',
      }),
    );

    await chat.handleSubmit();
    expect(chat.messages.at(2)).toBeUndefined();
  });

  it('should allow empty submit', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['Hello', ',', ' world', '.'],
      },
      {
        type: 'stream-chunks',
        chunks: ['How', ' can', ' I', ' help', ' you', '?'],
      },
      {
        type: 'stream-chunks',
        chunks: ['The', ' sky', ' is', ' blue', '.'],
      },
    ];

    chat.input = 'hi';
    await chat.handleSubmit();
    expect(chat.input).toBe('');
    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello, world.',
      }),
    );

    await chat.handleSubmit(undefined, { allowEmptySubmit: true });
    expect(chat.messages.at(2)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: '',
      }),
    );

    expect(chat.messages.at(3)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'How can I help you?',
      }),
    );

    chat.input = 'What color is the sky?';
    await chat.handleSubmit();
    expect(chat.messages.at(4)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'What color is the sky?',
      }),
    );

    expect(chat.messages.at(5)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'The sky is blue.',
      }),
    );
  });
});

describe('onToolCall', () => {
  let resolve: () => void;
  let toolCallPromise: Promise<void>;
  let chat: Chat;

  beforeEach(() => {
    ({ resolve, promise: toolCallPromise } = promiseWithResolvers<void>());

    chat = new Chat({
      async onToolCall({ toolCall }) {
        await toolCallPromise;
        return `test-tool-response: ${toolCall.toolName} ${
          toolCall.toolCallId
        } ${JSON.stringify(toolCall.args)}`;
      },
    });
  });

  it("should invoke onToolCall when a tool call is received from the server's response", async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatDataStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    };

    const appendOperation = chat.append({ role: 'user', content: 'hi' });
    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            },
          ],
        }),
      );
    });

    resolve();
    await appendOperation;

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        toolInvocations: [
          {
            state: 'result',
            step: 0,
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
            result:
              'test-tool-response: test-tool tool-call-0 {"testArg":"test-value"}',
          },
        ],
      }),
    );
  });
});

describe('tool invocations', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat({
      maxSteps: 5,
    });
  });

  it('should display partial tool call, tool call, and tool result', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    const appendOperation = chat.append({ role: 'user', content: 'hi' });

    controller.write(
      formatDataStreamPart('tool_call_streaming_start', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
    );

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'partial-call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
            },
          ],
        }),
      );
    });

    controller.write(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: '{"testArg":"t',
      }),
    );

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'partial-call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 't' },
            },
          ],
        }),
      );
    });

    controller.write(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: 'est-value"}}',
      }),
    );

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'partial-call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            },
          ],
        }),
      );
    });

    controller.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            },
          ],
        }),
      );
    });

    controller.write(
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();
    await appendOperation;

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        toolInvocations: [
          {
            state: 'result',
            step: 0,
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
            result: 'test-result',
          },
        ],
      }),
    );
  });

  it('should display partial tool call and tool result (when there is no tool call streaming)', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    const appendOperation = chat.append({ role: 'user', content: 'hi' });

    controller.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            },
          ],
        }),
      );
    });

    controller.write(
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();
    await appendOperation;

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        toolInvocations: [
          {
            state: 'result',
            step: 0,
            toolCallId: 'tool-call-0',
            toolName: 'test-tool',
            args: { testArg: 'test-value' },
            result: 'test-result',
          },
        ],
      }),
    );
  });

  it('should update tool call to result when addToolResult is called', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatDataStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'test-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    };

    await chat.append({ role: 'user', content: 'hi' });

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            },
          ],
        }),
      );
    });

    chat.addToolResult({
      toolCallId: 'tool-call-0',
      result: 'test-result',
    });

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'result',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
              result: 'test-result',
            },
          ],
        }),
      );
    });
  });

  it('should delay tool result submission until the stream is finished', async () => {
    const controller1 = new TestResponseController();
    const controller2 = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller: controller1 },
      { type: 'controlled-stream', controller: controller2 },
    ];

    chat.append({ role: 'user', content: 'hi' });

    // start stream
    controller1.write(
      formatDataStreamPart('start_step', {
        messageId: '1234',
      }),
    );

    // tool call
    controller1.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'call',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            },
          ],
        }),
      );
    });

    // user submits the tool result
    chat.addToolResult({
      toolCallId: 'tool-call-0',
      result: 'test-result',
    });

    // UI should show the tool result
    await vi.waitFor(() => {
      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          toolInvocations: [
            {
              state: 'result',
              step: 0,
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
              result: 'test-result',
            },
          ],
        }),
      );
    });

    // should not have called the API yet
    expect(server.calls.length).toBe(1);

    // finish stream
    controller1.write(
      formatDataStreamPart('finish_step', {
        isContinued: false,
        finishReason: 'tool-calls',
      }),
    );

    controller1.write(
      formatDataStreamPart('finish_message', {
        finishReason: 'tool-calls',
      }),
    );

    await controller1.close();

    // 2nd call should happen after the stream is finished
    await vi.waitFor(() => {
      expect(server.calls.length).toBe(2);
    });
  });
});

describe('maxSteps', () => {
  describe('two steps with automatic tool call', () => {
    let onToolCallInvoked = false;
    let chat: Chat;

    beforeEach(() => {
      chat = new Chat({
        async onToolCall({ toolCall }) {
          onToolCallInvoked = true;
          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxSteps: 5,
      });
      onToolCallInvoked = false;
    });

    it('should automatically call api when tool call gets executed via onToolCall', async () => {
      server.urls['/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatDataStreamPart('tool_call', {
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
        {
          type: 'stream-chunks',
          chunks: [formatDataStreamPart('text', 'final result')],
        },
      ];

      await chat.append({ role: 'user', content: 'hi' });

      expect(onToolCallInvoked).toBe(true);

      expect(chat.messages.at(1)).toStrictEqual(
        expect.objectContaining({
          content: 'final result',
        }),
      );
    });
  });

  describe('two steps with error response', () => {
    let onToolCallCounter = 0;
    let chat: Chat;

    beforeEach(() => {
      chat = new Chat({
        async onToolCall({ toolCall }) {
          onToolCallCounter++;
          return `test-tool-response: ${toolCall.toolName} ${
            toolCall.toolCallId
          } ${JSON.stringify(toolCall.args)}`;
        },
        maxSteps: 5,
      });
      onToolCallCounter = 0;
    });

    it('should automatically call api when tool call gets executed via onToolCall', async () => {
      server.urls['/api/chat'].response = [
        {
          type: 'stream-chunks',
          chunks: [
            formatDataStreamPart('tool_call', {
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
        {
          type: 'error',
          status: 400,
          body: 'call failure',
        },
      ];

      await chat.append({ role: 'user', content: 'hi' });

      expect(chat.error).toBeInstanceOf(Error);
      expect(chat.error?.message).toBe('call failure');
      expect(onToolCallCounter).toBe(1);
    });
  });
});

describe('file attachments with data url', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat();
  });

  it('should handle text file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with text attachment"'],
    };

    chat.input = 'Message with text attachment';

    await chat.handleSubmit(undefined, {
      experimental_attachments: createFileList(
        new File(['test file content'], 'test.txt', {
          type: 'text/plain',
        }),
      ),
    });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Message with text attachment',
        experimental_attachments: [
          expect.objectContaining({
            name: 'test.txt',
            contentType: 'text/plain',
            url: 'data:text/plain;base64,dGVzdCBmaWxlIGNvbnRlbnQ=',
          }),
        ],
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Response to message with text attachment',
      }),
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'Message with text attachment',
          experimental_attachments: [
            {
              name: 'test.txt',
              contentType: 'text/plain',
              url: 'data:text/plain;base64,dGVzdCBmaWxlIGNvbnRlbnQ=',
            },
          ],
          parts: [{ text: 'Message with text attachment', type: 'text' }],
        },
      ],
    });
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

    chat.input = 'Message with image attachment';

    await chat.handleSubmit(undefined, {
      experimental_attachments: createFileList(
        new File(['test image content'], 'test.png', {
          type: 'image/png',
        }),
      ),
    });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Message with image attachment',
        experimental_attachments: [
          expect.objectContaining({
            name: 'test.png',
            contentType: 'image/png',
            url: 'data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50',
          }),
        ],
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Response to message with image attachment',
      }),
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'Message with image attachment',
          experimental_attachments: [
            {
              name: 'test.png',
              contentType: 'image/png',
              url: 'data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50',
            },
          ],
          parts: [{ text: 'Message with image attachment', type: 'text' }],
        },
      ],
    });
  });
});

describe('file attachments with url', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat();
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

    chat.input = 'Message with image attachment';

    await chat.handleSubmit(undefined, {
      experimental_attachments: [
        {
          name: 'test.png',
          contentType: 'image/png',
          url: 'https://example.com/image.png',
        },
      ],
    });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Message with image attachment',
        experimental_attachments: [
          expect.objectContaining({
            name: 'test.png',
            contentType: 'image/png',
            url: 'https://example.com/image.png',
          }),
        ],
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Response to message with image attachment',
      }),
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'Message with image attachment',
          experimental_attachments: [
            {
              name: 'test.png',
              contentType: 'image/png',
              url: 'https://example.com/image.png',
            },
          ],
          parts: [{ text: 'Message with image attachment', type: 'text' }],
        },
      ],
    });
  });
});

describe('file attachments with empty text content', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat();
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

    await chat.handleSubmit(undefined, {
      allowEmptySubmit: true,
      experimental_attachments: [
        {
          name: 'test.png',
          contentType: 'image/png',
          url: 'https://example.com/image.png',
        },
      ],
    });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: '',
        experimental_attachments: [
          expect.objectContaining({
            name: 'test.png',
            contentType: 'image/png',
            url: 'https://example.com/image.png',
          }),
        ],
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Response to message with image attachment',
      }),
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: '',
          experimental_attachments: [
            {
              name: 'test.png',
              contentType: 'image/png',
              url: 'https://example.com/image.png',
            },
          ],
          parts: [{ text: '', type: 'text' }],
        },
      ],
    });
  });
});

describe('reload', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat();
  });

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['0:"first response"\n'],
      },
      {
        type: 'stream-chunks',
        chunks: ['0:"second response"\n'],
      },
    ];

    await chat.append({ role: 'user', content: 'hi' });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'first response',
      }),
    );

    // Setup done, call reload:
    await chat.reload({
      data: { 'test-data-key': 'test-data-value' },
      body: { 'request-body-key': 'request-body-value' },
      headers: { 'header-key': 'header-value' },
    });

    expect(await server.calls[1].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          content: 'hi',
          role: 'user',
          parts: [{ text: 'hi', type: 'text' }],
        },
      ],
      data: { 'test-data-key': 'test-data-value' },
      'request-body-key': 'request-body-value',
    });

    expect(server.calls[1].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'header-key': 'header-value',
    });

    expect(chat.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'second response',
      }),
    );
  });
});

describe('test sending additional fields during message submission', () => {
  let chat: Chat;

  beforeEach(() => {
    chat = new Chat();
  });

  it('should send annotations with the message', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"first response"\n'],
    };

    await chat.append({
      role: 'user',
      content: 'hi',
      annotations: ['this is an annotation'],
    });

    expect(chat.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'hi',
          annotations: ['this is an annotation'],
          parts: [{ text: 'hi', type: 'text' }],
        },
      ],
    });
  });
});

describe('initialMessages', () => {
  let chat: Chat;
  let initialMessages = $state<Message[]>([
    {
      id: 'test-msg-1',
      content: 'Test message 1',
      role: 'user',
    },
  ]);

  beforeEach(() => {
    chat = new Chat({
      get initialMessages() {
        return initialMessages;
      },
    });
  });

  it('should not update messages when initialMessages changes', () => {
    expect(chat.messages).toStrictEqual([
      expect.objectContaining({
        id: 'test-msg-1',
        content: 'Test message 1',
        role: 'user',
      }),
    ]);

    initialMessages = [
      {
        id: 'test-msg-2',
        content: 'Test message 2',
        role: 'user',
      },
    ];

    expect(chat.messages).toStrictEqual([
      expect.objectContaining({
        id: 'test-msg-1',
        content: 'Test message 1',
        role: 'user',
      }),
    ]);
  });
});

describe('synchronization', () => {
  it('correctly synchronizes content between hook instances', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    const {
      component: { chat1, chat2 },
    } = render(ChatSynchronization, { id: crypto.randomUUID() });

    await chat1.append({ role: 'user', content: 'hi' });

    expect(chat1.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hi',
      }),
    );
    expect(chat2.messages.at(0)).toStrictEqual(chat1.messages.at(0));

    expect(chat1.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello, world.',
      }),
    );
    expect(chat2.messages.at(1)).toStrictEqual(chat1.messages.at(1));
  });

  it('correctly synchronizes loading and error state between hook instances', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    const {
      component: { chat1, chat2 },
    } = render(ChatSynchronization, { id: crypto.randomUUID() });

    const appendOperation = chat1.append({ role: 'user', content: 'hi' });

    await vi.waitFor(() => {
      expect(chat1.status).toBe('submitted');
      expect(chat2.status).toBe('submitted');
    });

    controller.write('0:"Hello"\n');
    await vi.waitFor(() => {
      expect(chat1.status).toBe('streaming');
      expect(chat2.status).toBe('streaming');
    });

    controller.error(new Error('Failed to be cool enough'));
    await appendOperation;

    expect(chat1.status).toBe('error');
    expect(chat2.status).toBe('error');
    expect(chat1.error).toBeInstanceOf(Error);
    expect(chat1.error?.message).toBe('Failed to be cool enough');
    expect(chat2.error).toBeInstanceOf(Error);
    expect(chat2.error?.message).toBe('Failed to be cool enough');
  });
});

describe('generateId function', () => {
  it('should use the provided generateId function for both user and assistant messages', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    const mockGenerateId = vi.fn().mockReturnValue('custom-id');
    const chatWithCustomId = new Chat({
      generateId: mockGenerateId,
    });

    await chatWithCustomId.append({ role: 'user', content: 'hi' });

    expect(chatWithCustomId.messages.at(0)).toStrictEqual(
      expect.objectContaining({
        id: 'custom-id',
        role: 'user',
        content: 'hi',
      }),
    );

    expect(chatWithCustomId.messages.at(1)).toStrictEqual(
      expect.objectContaining({
        id: 'custom-id',
        role: 'assistant',
        content: 'Hello, world.',
      }),
    );
  });
});

describe('reactivity', () => {
  it('should be able to render as a derived', () => {
    const chat = $derived(new Chat());
    // If this isn't handled correctly, it'd show a `state_unsafe_mutation` error.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    chat.messages;
  });
});
