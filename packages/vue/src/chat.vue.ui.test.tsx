import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/vue';
import { UIMessageStreamPart } from 'ai';
import { setupTestComponent } from './setup-test-component';
import TestChatAppendAttachmentsComponent from './TestChatAppendAttachmentsComponent.vue';
import TestChatAttachmentsComponent from './TestChatAttachmentsComponent.vue';
import TestChatComponent from './TestChatComponent.vue';
import TestChatInitMessages from './TestChatInitMessages.vue';
import TestChatPrepareRequestBodyComponent from './TestChatPrepareRequestBodyComponent.vue';
import TestChatReloadComponent from './TestChatReloadComponent.vue';
import TestChatTextStreamComponent from './TestChatTextStreamComponent.vue';
import TestChatToolInvocationsComponent from './TestChatToolInvocationsComponent.vue';
import TestChatUrlAttachmentsComponent from './TestChatUrlAttachmentsComponent.vue';

function formatStreamPart(part: UIMessageStreamPart) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/chat': {},
});

describe('prepareSubmitMessagesRequest', () => {
  setupTestComponent(TestChatPrepareRequestBodyComponent);

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({ type: 'text-start', id: '0' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ',' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ' world' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: '.' }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await waitFor(() => {
      const element = screen.getByTestId('on-options');
      expect(element.textContent?.trim() ?? '').not.toBe('');
    });

    const value = JSON.parse(
      screen.getByTestId('on-options').textContent ?? '',
    );

    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(value).toStrictEqual({
      id: expect.any(String),
      api: '/api/chat',
      trigger: 'submit-user-message',
      body: { 'request-body-key': 'request-body-value' },
      headers: { 'request-header-key': 'request-header-value' },
      requestMetadata: { 'request-metadata-key': 'request-metadata-value' },
      messages: [
        {
          role: 'user',
          id: expect.any(String),
          parts: [{ type: 'text', text: 'hi' }],
        },
      ],
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      'body-key': 'body-value',
    });
    expect(server.calls[0].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      'header-key': 'header-value',
    });

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
      chunks: [
        formatStreamPart({ type: 'text-start', id: '0' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ',' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ' world' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: '.' }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
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

      controller.write(formatStreamPart({ type: 'text-start', id: '0' }));
      controller.write(
        formatStreamPart({ type: 'text-delta', id: '0', delta: 'Hello' }),
      );
      controller.write(formatStreamPart({ type: 'text-end', id: '0' }));

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

        controller.write(formatStreamPart({ type: 'text-start', id: '0' }));
        controller.write(
          formatStreamPart({ type: 'text-delta', id: '0', delta: 'Hello' }),
        );

        await waitFor(() =>
          expect(screen.getByTestId('status')).toHaveTextContent('streaming'),
        );

        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        controller.write(
          formatStreamPart({ type: 'text-delta', id: '0', delta: ' world.' }),
        );
        controller.write(formatStreamPart({ type: 'text-end', id: '0' }));
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
        formatStreamPart({ type: 'text-start', id: '0' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ',' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ' world' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: '.' }),
        formatStreamPart({ type: 'text-end', id: '0' }),
        formatStreamPart({ type: 'finish' }),
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
          role: 'assistant',
          parts: [{ text: 'Hello, world.', type: 'text', state: 'done' }],
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
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            { text: 'Hello, world.', type: 'text', state: 'done' },
          ],
        },
      },
    ]);
  });
});

describe('regenerate', () => {
  setupTestComponent(TestChatReloadComponent);

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = [
      {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text-start', id: '0' }),
          formatStreamPart({
            type: 'text-delta',
            id: '0',
            delta: 'first response',
          }),
          formatStreamPart({ type: 'text-end', id: '0' }),
        ],
      },
      {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text-start', id: '0' }),
          formatStreamPart({
            type: 'text-delta',
            id: '0',
            delta: 'second response',
          }),
          formatStreamPart({ type: 'text-end', id: '0' }),
        ],
      },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');

    // setup done, click reload:
    await userEvent.click(screen.getByTestId('do-regenerate'));

    expect(await server.calls[1].requestBodyJson).toStrictEqual({
      id: expect.any(String),
      messages: [
        {
          id: 'id-0',
          parts: [
            {
              text: 'hi',
              type: 'text',
            },
          ],
          role: 'user',
        },
      ],
      'request-body-key': 'request-body-value',
      trigger: 'regenerate-assistant-message',
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

describe('tool invocations', () => {
  setupTestComponent(TestChatToolInvocationsComponent);

  it('should display partial tool call, tool call, and tool result', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = [
      {
        type: 'controlled-stream',
        controller,
      },
      // DO NOT REMOVE: used to ensure test does not have side-effects
      {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text-start', id: '0' }),
          formatStreamPart({
            type: 'text-delta',
            id: '0',
            delta: 'extra text',
          }),
          formatStreamPart({ type: 'text-end', id: '0' }),
        ],
      },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(
      formatStreamPart({
        type: 'tool-input-start',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"input-streaming"}',
      );
    });

    controller.write(
      formatStreamPart({
        type: 'tool-input-delta',
        toolCallId: 'tool-call-0',
        inputTextDelta: '{"testArg":"t',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"input-streaming","input":{"testArg":"t"}}',
      );
    });

    controller.write(
      formatStreamPart({
        type: 'tool-input-delta',
        toolCallId: 'tool-call-0',
        inputTextDelta: 'est-value"}}',
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"input-streaming","input":{"testArg":"test-value"}}',
      );
    });

    controller.write(
      formatStreamPart({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-output-available',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'output-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
        output: 'test-result',
      });
    });

    // DO NOT REMOVE: used to ensure test does not have side-effects
    await waitFor(() => {
      expect(screen.getByTestId('text-1')).toHaveTextContent('extra text');
    });
  });

  it('should display tool call and tool result (when there is no tool call streaming)', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = [
      {
        type: 'controlled-stream',
        controller,
      },
      // DO NOT REMOVE: used to ensure test does not have side-effects
      {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text-start', id: '0' }),
          formatStreamPart({
            type: 'text-delta',
            id: '0',
            delta: 'extra text',
          }),
          formatStreamPart({ type: 'text-end', id: '0' }),
        ],
      },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(
      formatStreamPart({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('message-1').textContent ?? ''),
      ).toStrictEqual({
        state: 'input-available',
        input: { testArg: 'test-value' },
        toolCallId: 'tool-call-0',
        type: 'tool-test-tool',
      });
    });

    controller.write(
      formatStreamPart({
        type: 'tool-output-available',
        toolCallId: 'tool-call-0',
        output: 'test-result',
      }),
    );
    controller.close();

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent('test-result');
    });

    // DO NOT REMOVE: wait for final text to ensure test does not have side-effects
    await waitFor(() => {
      expect(screen.getByTestId('text-1')).toHaveTextContent('extra text');
    });
  });

  it('should update tool call to result when addToolResult is called', async () => {
    const controller = new TestResponseController();
    server.urls['/api/chat'].response = [
      {
        type: 'controlled-stream',
        controller,
      },
      // DO NOT REMOVE: used to ensure test does not have side-effects
      {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text-start', id: '0' }),
          formatStreamPart({
            type: 'text-delta',
            id: '0',
            delta: 'extra text',
          }),
          formatStreamPart({ type: 'text-end', id: '0' }),
        ],
      },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    controller.write(formatStreamPart({ type: 'start' }));
    controller.write(formatStreamPart({ type: 'start-step' }));
    controller.write(
      formatStreamPart({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"input-available","input":{"testArg":"test-value"}}',
      );
    });

    await userEvent.click(screen.getByTestId('add-result-0'));

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"output-available","input":{"testArg":"test-value"},"output":"test-result"}',
      );
    });

    controller.write(formatStreamPart({ type: 'text-start', id: '0' }));
    controller.write(
      formatStreamPart({
        type: 'text-delta',
        id: '0',
        delta: 'more text',
      }),
    );
    controller.write(formatStreamPart({ type: 'text-end', id: '0' }));
    controller.close();

    // DO NOT REMOVE: used to ensure test does not have side-effects
    await waitFor(() => {
      expect(screen.getByTestId('text-1')).toHaveTextContent('extra text');
    });
  });

  it('should delay tool result submission until the stream is finished', async () => {
    const controller1 = new TestResponseController();

    server.urls['/api/chat'].response = [
      { type: 'controlled-stream', controller: controller1 },
      // DO NOT REMOVE: used to ensure test does not have side-effects
      {
        type: 'stream-chunks',
        chunks: [
          formatStreamPart({ type: 'text-start', id: '0' }),
          formatStreamPart({
            type: 'text-delta',
            id: '0',
            delta: 'extra text',
          }),
          formatStreamPart({ type: 'text-end', id: '0' }),
        ],
      },
    ];

    await userEvent.click(screen.getByTestId('do-append'));

    // start stream
    controller1.write(formatStreamPart({ type: 'start' }));
    controller1.write(formatStreamPart({ type: 'start-step' }));

    // tool call
    controller1.write(
      formatStreamPart({
        type: 'tool-input-available',
        toolCallId: 'tool-call-0',
        toolName: 'test-tool',
        input: { testArg: 'test-value' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"input-available","input":{"testArg":"test-value"}}',
      );
    });

    // user submits the tool result
    await userEvent.click(screen.getByTestId('add-result-0'));

    // UI should show the tool result
    await waitFor(() => {
      expect(screen.getByTestId('message-1')).toHaveTextContent(
        '{"type":"tool-test-tool","toolCallId":"tool-call-0","state":"output-available","input":{"testArg":"test-value"},"output":"test-result"}',
      );
    });

    // should not have called the API yet
    expect(server.calls.length).toBe(1);

    // finish stream
    controller1.write(formatStreamPart({ type: 'finish-step' }));
    controller1.write(formatStreamPart({ type: 'finish' }));

    await controller1.close();

    // 2nd call should happen after the stream is finished
    await waitFor(() => {
      expect(server.calls.length).toBe(2);
    });

    // DO NOT REMOVE: used to ensure test does not have side-effects
    await waitFor(() => {
      expect(screen.getByTestId('text-1')).toHaveTextContent('extra text');
    });
  });
});

describe('file attachments with data url', () => {
  setupTestComponent(TestChatAttachmentsComponent);

  it('should handle text file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({
          type: 'text-start',
          id: '0',
        }),
        formatStreamPart({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with text attachment',
        }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
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

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-0',
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'text/plain',
              filename: 'test.txt',
              url: 'data:text/plain;base64,dGVzdCBmaWxlIGNvbnRlbnQ=',
            },
            {
              type: 'text',
              text: 'Message with text attachment',
            },
          ],
        },
        {
          id: 'id-1',
          parts: [
            {
              text: 'Response to message with text attachment',
              type: 'text',
              state: 'done',
            },
          ],
          role: 'assistant',
        },
      ]);
    });
  });

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({
          type: 'text-start',
          id: '0',
        }),
        formatStreamPart({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
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

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          id: 'id-0',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              filename: 'test.png',
              url: 'data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50',
            },
            {
              type: 'text',
              text: 'Message with image attachment',
            },
          ],
        },
        {
          role: 'assistant',
          id: 'id-1',
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
              state: 'done',
            },
          ],
        },
      ]);
    });
  });
});

describe('file attachments with url', () => {
  setupTestComponent(TestChatUrlAttachmentsComponent);

  it('should handle image file attachment and submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({
          type: 'text-start',
          id: '0',
        }),
        formatStreamPart({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
    };

    const messageInput = screen.getByTestId('message-input');
    await userEvent.type(messageInput, 'Message with image attachment');

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          role: 'user',
          id: 'id-0',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              url: 'https://example.com/image.png',
            },
            {
              type: 'text',
              text: 'Message with image attachment',
            },
          ],
        },
        {
          role: 'assistant',
          id: 'id-1',
          parts: [
            {
              type: 'text',
              text: 'Response to message with image attachment',
              state: 'done',
            },
          ],
        },
      ]);
    });
  });
});

describe('attachments with empty submit', () => {
  setupTestComponent(TestChatAttachmentsComponent);

  it('should handle image file attachment and empty submission', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({
          type: 'text-start',
          id: '0',
        }),
        formatStreamPart({
          type: 'text-delta',
          id: '0',
          delta: 'Response to empty message with attachment',
        }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
    };

    const file = new File(['test image content'], 'test.png', {
      type: 'image/png',
    });

    const fileInput = screen.getByTestId('file-input');
    await userEvent.upload(fileInput, file);

    const submitButton = screen.getByTestId('submit-button');
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-0',
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              filename: 'test.png',
              url: 'data:image/png;base64,dGVzdCBpbWFnZSBjb250ZW50',
            },
            {
              type: 'text',
              text: '',
            },
          ],
        },
        {
          id: 'id-1',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'Response to empty message with attachment',
              state: 'done',
            },
          ],
        },
      ]);
    });
  });
});

describe('should append message with attachments', () => {
  setupTestComponent(TestChatAppendAttachmentsComponent);

  it('should handle image file attachment with append', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({
          type: 'text-start',
          id: '0',
        }),
        formatStreamPart({
          type: 'text-delta',
          id: '0',
          delta: 'Response to message with image attachment',
        }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
    };

    const appendButton = screen.getByTestId('do-append');
    await userEvent.click(appendButton);

    await waitFor(() => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        {
          id: 'id-0',
          parts: [
            {
              mediaType: 'image/png',
              type: 'file',
              url: 'https://example.com/image.png',
            },
            {
              text: 'Message with image attachment',
              type: 'text',
            },
          ],
          role: 'user',
        },
        {
          id: 'id-1',
          parts: [
            {
              text: 'Response to message with image attachment',
              type: 'text',
              state: 'done',
            },
          ],
          role: 'assistant',
        },
      ]);
    });
  });
});

describe('init messages', () => {
  setupTestComponent(TestChatInitMessages);

  it('should show streamed response', async () => {
    server.urls['/api/chat'].response = {
      type: 'stream-chunks',
      chunks: [
        formatStreamPart({ type: 'text-start', id: '0' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ',' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: ' world' }),
        formatStreamPart({ type: 'text-delta', id: '0', delta: '.' }),
        formatStreamPart({ type: 'text-end', id: '0' }),
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-2');
    expect(screen.getByTestId('message-2')).toHaveTextContent('User: Hi.');

    await screen.findByTestId('message-3');
    expect(screen.getByTestId('message-3')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });
});
