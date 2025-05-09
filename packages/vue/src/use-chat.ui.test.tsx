import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/vue';
import { setupTestComponent } from './setup-test-component';
import TestChatAppendAttachmentsComponent from './TestChatAppendAttachmentsComponent.vue';
import TestChatAttachmentsComponent from './TestChatAttachmentsComponent.vue';
import TestChatComponent from './TestChatComponent.vue';
import TestChatCustomMetadataComponent from './TestChatCustomMetadataComponent.vue';
import TestChatFormComponent from './TestChatFormComponent.vue';
import TestChatFormOptionsComponent from './TestChatFormOptionsComponent.vue';
import TestChatPrepareRequestBodyComponent from './TestChatPrepareRequestBodyComponent.vue';
import TestChatReloadComponent from './TestChatReloadComponent.vue';
import TestChatTextStreamComponent from './TestChatTextStreamComponent.vue';
import TestChatToolInvocationsComponent from './TestChatToolInvocationsComponent.vue';
import TestChatUrlAttachmentsComponent from './TestChatUrlAttachmentsComponent.vue';

const server = createTestServer({
  '/api/chat': {},
});

describe('prepareRequestBody', () => {
  setupTestComponent(TestChatPrepareRequestBodyComponent);

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await waitFor(() => {
      const element = screen.getByTestId('on-body-options');
      expect(element.textContent?.trim() ?? '').not.toBe('');
    });

    const value = JSON.parse(
      screen.getByTestId('on-body-options').textContent ?? '',
    );

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');
    expect(value).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          role: 'user',
          content: 'hi',
          id: expect.any(String),
          createdAt: expect.any(String),
          parts: [{ type: 'text', text: 'hi' }],
        },
      ],
      requestData: { 'test-data-key': 'test-data-value' },
      requestBody: { 'request-body-key': 'request-body-value' },
    });

    expect(await server.calls[0].requestBody).toBe('test-request-body');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });
});

describe('data protocol stream', () => {
  setupTestComponent(TestChatComponent);

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it('should show streamed response with data', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('data');
    expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent('AI: Hello');
  });

  describe('setData', () => {
    it('should set data', async () => {
      await userEvent.click(screen.getByTestId('do-set-data'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"set"}]');
    });

    it('should clear data', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
      };

      await userEvent.click(screen.getByTestId('do-append'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

      await userEvent.click(screen.getByTestId('do-clear-data'));

      await screen.findByTestId('data');
      expect(screen.getByTestId('data')).toHaveTextContent('');
    });
  });

  it('should show error response', async () => {
    server.urls['/api/chat'].response = {
      type: 'error',
      status: 404,
      body: 'Not found',
    };

    await userEvent.click(screen.getByTestId('do-append'));

    // TODO bug? the user message does not show up
    // await screen.findByTestId('message-0');
    // expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
  });

  describe('status', () => {
    it('should show status', async () => {
      const controller = new TestResponseController();
      server.urls['/api/chat'].response = {
        type: 'controlled-stream',
        controller,
      };

      await userEvent.click(screen.getByTestId('do-append'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('submitted');
      });

      controller.write('0:"Hello"\n');

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('streaming');
      });

      controller.close();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
    });

    it('should update status when the tab is hidden', async () => {
      const controller = new TestResponseController();
      server.urls['/api/chat'].response = {
        type: 'controlled-stream',
        controller,
      };

      const originalVisibilityState = document.visibilityState;

      try {
        await userEvent.click(screen.getByTestId('do-append'));
        await waitFor(() =>
          expect(screen.getByTestId('status')).toHaveTextContent('submitted'),
        );

        controller.write('0:"Hello"\n');
        await waitFor(() =>
          expect(screen.getByTestId('status')).toHaveTextContent('streaming'),
        );

        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        controller.write('0:", world."\n');
        controller.close();

        await waitFor(() =>
          expect(screen.getByTestId('status')).toHaveTextContent('ready'),
        );
      } finally {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => originalVisibilityState,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }
    });

    it('should set status to error when there is a server error', async () => {
      server.urls['/api/chat'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      await userEvent.click(screen.getByTestId('do-append'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('error');
      });
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

    await userEvent.click(screen.getByTestId('do-append'));

    await waitFor(() => {
      const element = screen.getByTestId('on-finish-calls');
      expect(element.textContent?.trim() ?? '').not.toBe('');
    });

    const value = JSON.parse(
      screen.getByTestId('on-finish-calls').textContent ?? '',
    );

    expect(value).toStrictEqual([
      {
        message: {
          id: expect.any(String),
          createdAt: expect.any(String),
          role: 'assistant',
          content: 'Hello, world.',
          parts: [{ text: 'Hello, world.', type: 'text' }],
        },
        options: {
          finishReason: 'stop',
          usage: {
            completionTokens: 1,
            promptTokens: 3,
            totalTokens: 4,
          },
        },
      },
    ]);
  });
});

describe('text stream', () => {
  setupTestComponent(TestChatTextStreamComponent);

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it('should invoke onFinish when the stream finishes', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await waitFor(() => {
      const element = screen.getByTestId('on-finish-calls');
      expect(element.textContent?.trim() ?? '').not.toBe('');
    });

    const value = JSON.parse(
      screen.getByTestId('on-finish-calls').textContent ?? '',
    );

    expect(value).toStrictEqual([
      {
        message: {
          id: expect.any(String),
          createdAt: expect.any(String),
          role: 'assistant',
          content: 'Hello, world.',
          parts: [{ text: 'Hello, world.', type: 'text' }],
        },
        options: {
          finishReason: 'unknown',
          usage: {
            // note: originally NaN (lost in JSON stringify)
            completionTokens: null,
            promptTokens: null,
            totalTokens: null,
          },
        },
      },
    ]);
  });
});

describe('custom metadata', () => {
  setupTestComponent(TestChatCustomMetadataComponent);

  it('should should use custom headers', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello, World."\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-1');

    expect(server.calls[0].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      header1: 'value1',
      header2: 'value2',
    });
  });

  it('should should use custom body', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Hello, World."\n'],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-1');

    expect(await server.calls[0].requestBody).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          content: 'custom metadata component',
          role: 'user',
          parts: [{ text: 'custom metadata component', type: 'text' }],
        },
      ],
      body1: 'value1',
      body2: 'value2',
    });
  });
});

describe('form actions', () => {
  setupTestComponent(TestChatFormComponent);

  it('should show streamed response using handleSubmit', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['Hello', ',', ' world', '.'].map(token =>
          formatDataStreamPart('text', token),
        ),
      },
      {
        type: 'stream-chunks',
        chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
          formatDataStreamPart('text', token),
        ),
      },
    ];

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    const secondInput = screen.getByTestId('do-input');
    await userEvent.type(secondInput, '{Enter}');

    expect(screen.queryByTestId('message-2')).not.toBeInTheDocument();
  });
});

describe('form actions (with options)', () => {
  setupTestComponent(TestChatFormOptionsComponent);

  it('should show streamed response using handleSubmit', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: ['Hello', ',', ' world', '.'].map(token =>
          formatDataStreamPart('text', token),
        ),
      },
      {
        type: 'stream-chunks',
        chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
          formatDataStreamPart('text', token),
        ),
      },
      {
        type: 'stream-chunks',
        chunks: ['The', ' sky', ' is', ' blue.'].map(token =>
          formatDataStreamPart('text', token),
        ),
      },
    ];

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    const secondInput = screen.getByTestId('do-input');
    await userEvent.type(secondInput, '{Enter}');

    await screen.findByTestId('message-2');
    expect(screen.getByTestId('message-2')).toHaveTextContent('User:');

    await screen.findByTestId('message-3');
    expect(screen.getByTestId('message-3')).toHaveTextContent(
      'AI: How can I help you?',
    );

    const thirdInput = screen.getByTestId('do-input');
    await userEvent.type(thirdInput, 'what color is the sky?');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-4');
    expect(screen.getByTestId('message-4')).toHaveTextContent(
      'User: what color is the sky?',
    );

    await screen.findByTestId('message-5');
    expect(screen.getByTestId('message-5')).toHaveTextContent(
      'AI: The sky is blue.',
    );
  });
});

describe('reload', () => {
  setupTestComponent(TestChatReloadComponent);

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

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');

    // setup done, click reload:
    await userEvent.click(screen.getByTestId('do-reload'));

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

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: second response',
    );
  });
});

describe('onToolCall', () => {
  setupTestComponent(TestChatFormComponent);

  it('should invoke onToolCall when a tool call is received from the servers response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatDataStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'client-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    };

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'test-tool-response: client-tool tool-call-0 {"testArg":"test-value"}',
    );
  });
});

describe('tool invocations', () => {
  setupTestComponent(TestChatToolInvocationsComponent);

  it('should display partial tool call, tool call, and tool result', async () => {
    const controller = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller },
      { type: 'stream-chunks', chunks: ['0:"test-result"\n'] },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(
      formatDataStreamPart('tool_call_streaming_start', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"partial-call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool"}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: '{"testArg":"t',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"partial-call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"t"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tool-call-0',
        argsTextDelta: 'est-value"}}',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"partial-call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });

    // wait for final text to ensure test does not have side-effects
    await waitFor(() => {
      expect(screen.getByTestId('text-1')).toHaveTextContent('test-result');
    });
  });

  it('should display tool call and tool result (when there is no tool call streaming)', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = {
      type: 'controlled-stream',
      controller,
    };

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(
      formatDataStreamPart('tool_call', {
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        args: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatDataStreamPart('tool_result', {
        toolCallId: 'tool-call-0',
        result: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent('test-result');
    });
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

    await userEvent.click(screen.getByTestId('do-append'));

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    await userEvent.click(screen.getByTestId('add-result-0'));

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });
  });

  it('should delay tool result submission until the stream is finished', async () => {
    const controller1 = new TestResponseController();
    const controller2 = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller: controller1 },
      { type: 'controlled-stream', controller: controller2 },
      { type: 'stream-chunks', chunks: ['0:"test-result"\n'] },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

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

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"call","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"}}',
      );
    });

    // user submits the tool result
    await userEvent.click(screen.getByTestId('add-result-0'));

    // UI should show the tool result
    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
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
    await waitFor(() => {
      expect(server.calls.length).toBe(2);
    });

    // wait for final text to ensure test does not have side-effects
    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"state":"result","step":0,"toolCallId":"tool-call-0","toolName":"test-tool","args":{"testArg":"test-value"},"result":"test-result"}',
      );
    });
  });
});

describe('file attachments with data url', () => {
  setupTestComponent(TestChatAttachmentsComponent);

  it('should handle text file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with text attachment"\n'],
    };

    const file = new File(['test file content'], 'test.txt', {
      type: 'text/plain',
    });

    const fileInput = screen.getByTestId('file-input');
    await userEvent.upload(fileInput, file);

    const messageInput = screen.getByTestId('message-input');
    await userEvent.type(messageInput, 'Message with text attachment');

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent(
      'User: Message with text attachment',
    );

    await screen.findByTestId('attachment-0');
    expect(screen.getByTestId('attachment-0')).toHaveTextContent(
      'test file content',
    );

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Response to message with text attachment',
    );
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

    const file = new File(['test image content'], 'test.png', {
      type: 'image/png',
    });

    const fileInput = screen.getByTestId('file-input');
    await userEvent.upload(fileInput, file);

    const messageInput = screen.getByTestId('message-input');
    await userEvent.type(messageInput, 'Message with image attachment');

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent(
      'User: Message with image attachment',
    );

    await screen.findByTestId('attachment-0');
    expect(screen.getByTestId('attachment-0')).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/png;base64'),
    );

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Response to message with image attachment',
    );
  });
});

describe('file attachments with url', () => {
  setupTestComponent(TestChatUrlAttachmentsComponent);

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

    const messageInput = screen.getByTestId('message-input');
    await userEvent.type(messageInput, 'Message with image attachment');

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent(
      'User: Message with image attachment',
    );

    await screen.findByTestId('attachment-0');
    expect(screen.getByTestId('attachment-0')).toHaveAttribute(
      'src',
      'https://example.com/image.png',
    );

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Response to message with image attachment',
    );
  });
});

describe('attachments with empty submit', () => {
  setupTestComponent(TestChatAttachmentsComponent);

  it('should handle image file attachment and empty submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to empty message with attachment"\n'],
    };

    const file = new File(['test image content'], 'test.png', {
      type: 'image/png',
    });

    const fileInput = screen.getByTestId('file-input');
    await userEvent.upload(fileInput, file);

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User:');

    await screen.findByTestId('attachment-0');
    expect(screen.getByTestId('attachment-0')).toHaveAttribute(
      'src',
      expect.stringContaining('data:image/png;base64'),
    );

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Response to empty message with attachment',
    );
  });
});

describe('should append message with attachments', () => {
  setupTestComponent(TestChatAppendAttachmentsComponent);

  it('should handle image file attachment with append', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: ['0:"Response to message with image attachment"\n'],
    };

    const appendButton = screen.getByTestId('do-append');
    await userEvent.click(appendButton);

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent(
      'User: Message with image attachment',
    );

    await screen.findByTestId('attachment-0');
    expect(screen.getByTestId('attachment-0')).toHaveAttribute(
      'src',
      'https://example.com/image.png',
    );

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Response to message with image attachment',
    );
  });
});
