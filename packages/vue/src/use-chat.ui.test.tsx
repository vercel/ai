import { withTestServer } from '@ai-sdk/provider-utils/test';
import { formatDataStreamPart } from '@ai-sdk/ui-utils';
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
} from '@ai-sdk/ui-utils/test';
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

describe('prepareRequestBody', () => {
  setupTestComponent(TestChatPrepareRequestBodyComponent);

  it(
    'should show streamed response',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
      },
      async ({ call }) => {
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

        expect(await call(0).getRequestBodyJson()).toBe('test-request-body');

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: Hello, world.',
        );
      },
    ),
  );
});

describe('data protocol stream', () => {
  setupTestComponent(TestChatComponent);

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it('should show streamed response with data', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
    });

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

    it(
      'should clear data',
      withTestServer(
        {
          type: 'stream-values',
          url: '/api/chat',
          content: ['2:[{"t1":"v1"}]\n', '0:"Hello"\n'],
        },
        async () => {
          await userEvent.click(screen.getByTestId('do-append'));

          await screen.findByTestId('data');
          expect(screen.getByTestId('data')).toHaveTextContent('[{"t1":"v1"}]');

          await userEvent.click(screen.getByTestId('do-clear-data'));

          await screen.findByTestId('data');
          expect(screen.getByTestId('data')).toHaveTextContent('');
        },
      ),
    );
  });

  it('should show error response', async () => {
    mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

    await userEvent.click(screen.getByTestId('do-append'));

    // TODO bug? the user message does not show up
    // await screen.findByTestId('message-0');
    // expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
  });

  describe('status', () => {
    it('should show status', async () => {
      let startGeneration: ((value?: unknown) => void) | undefined;
      const startGenerationPromise = new Promise(resolve => {
        startGeneration = resolve;
      });

      let finishGeneration: ((value?: unknown) => void) | undefined;
      const finishGenerationPromise = new Promise(resolve => {
        finishGeneration = resolve;
      });

      mockFetchDataStreamWithGenerator({
        url: 'https://example.com/api/chat',
        chunkGenerator: (async function* generate() {
          await startGenerationPromise;
          const encoder = new TextEncoder();
          yield encoder.encode('0:"Hello"\n');
          await finishGenerationPromise;
        })(),
      });

      await userEvent.click(screen.getByTestId('do-append'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('submitted');
      });

      startGeneration?.();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('streaming');
      });

      finishGeneration?.();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
    });

    it('should set status to error when there is a server error', async () => {
      mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

      await userEvent.click(screen.getByTestId('do-append'));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('error');
      });
    });
  });

  it(
    'should invoke onFinish when the stream finishes',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: [
          formatDataStreamPart('text', 'Hello'),
          formatDataStreamPart('text', ','),
          formatDataStreamPart('text', ' world'),
          formatDataStreamPart('text', '.'),
          formatDataStreamPart('finish_message', {
            finishReason: 'stop',
            usage: { completionTokens: 1, promptTokens: 3 },
          }),
        ],
      },
      async () => {
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
      },
    ),
  );
});

describe('text stream', () => {
  setupTestComponent(TestChatTextStreamComponent);

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'],
    });

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );
  });

  it(
    'should invoke onFinish when the stream finishes',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['Hello', ',', ' world', '.'],
      },
      async () => {
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
      },
    ),
  );
});

describe('custom metadata', () => {
  setupTestComponent(TestChatCustomMetadataComponent);

  it(
    'should should use custom headers',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Hello, World."\n'],
      },
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-1');

        expect(call(0).getRequestHeaders()).toStrictEqual({
          'content-type': 'application/json',
          header1: 'value1',
          header2: 'value2',
        });
      },
    ),
  );

  it(
    'should should use custom body',
    withTestServer(
      {
        url: '/api/chat',
        type: 'stream-values',
        content: ['0:"Hello, World."\n'],
      },
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-1');

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
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
      },
    ),
  );
});

describe('form actions', () => {
  setupTestComponent(TestChatFormComponent);

  it('should show streamed response using handleSubmit', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    const secondInput = screen.getByTestId('do-input');
    await userEvent.type(secondInput, '{Enter}');

    expect(screen.queryByTestId('message-2')).not.toBeInTheDocument();
  });
});

describe('form actions (with options)', () => {
  setupTestComponent(TestChatFormOptionsComponent);

  it('should show streamed response using handleSubmit', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['Hello', ',', ' world', '.'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    const firstInput = screen.getByTestId('do-input');
    await userEvent.type(firstInput, 'hi');
    await userEvent.keyboard('{Enter}');

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['How', ' can', ' I', ' help', ' you', '?'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

    const secondInput = screen.getByTestId('do-input');
    await userEvent.type(secondInput, '{Enter}');

    await screen.findByTestId('message-2');
    expect(screen.getByTestId('message-2')).toHaveTextContent('User:');

    await screen.findByTestId('message-3');
    expect(screen.getByTestId('message-3')).toHaveTextContent(
      'AI: How can I help you?',
    );

    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['The', ' sky', ' is', ' blue.'].map(token =>
        formatDataStreamPart('text', token),
      ),
    });

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

  it(
    'should show streamed response',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"first response"\n'],
        },
        {
          url: '/api/chat',
          type: 'stream-values',
          content: ['0:"second response"\n'],
        },
      ],
      async ({ call }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        await screen.findByTestId('message-0');
        expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

        await screen.findByTestId('message-1');

        // setup done, click reload:
        await userEvent.click(screen.getByTestId('do-reload'));

        expect(await call(1).getRequestBodyJson()).toStrictEqual({
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

        expect(call(1).getRequestHeaders()).toStrictEqual({
          'content-type': 'application/json',
          'header-key': 'header-value',
        });

        await screen.findByTestId('message-1');
        expect(screen.getByTestId('message-1')).toHaveTextContent(
          'AI: second response',
        );
      },
    ),
  );
});

describe('onToolCall', () => {
  setupTestComponent(TestChatFormComponent);

  it('should invoke onToolCall when a tool call is received from the servers response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: [
        formatDataStreamPart('tool_call', {
          toolCallId: 'tool-call-0',
          toolName: 'client-tool',
          args: { testArg: 'test-value' },
        }),
      ],
    });

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

  it(
    'should display partial tool call, tool call, and tool result',
    withTestServer(
      { url: '/api/chat', type: 'controlled-stream' },
      async ({ streamController }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        streamController.enqueue(
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

        streamController.enqueue(
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

        streamController.enqueue(
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

        streamController.enqueue(
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

        streamController.enqueue(
          formatDataStreamPart('tool_result', {
            toolCallId: 'tool-call-0',
            result: 'test-result',
          }),
        );
        streamController.close();

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            'test-result',
          );
        });
      },
    ),
  );

  it(
    'should display partial tool call and tool result (when there is no tool call streaming)',
    withTestServer(
      { url: '/api/chat', type: 'controlled-stream' },
      async ({ streamController }) => {
        await userEvent.click(screen.getByTestId('do-append'));

        streamController.enqueue(
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

        streamController.enqueue(
          formatDataStreamPart('tool_result', {
            toolCallId: 'tool-call-0',
            result: 'test-result',
          }),
        );
        streamController.close();

        await waitFor(() => {
          expect(screen.getByTestId('message-1')).toHaveTextContent(
            'test-result',
          );
        });
      },
    ),
  );

  it(
    'should update tool call to result when addToolResult is called',
    withTestServer(
      [
        {
          url: '/api/chat',
          type: 'stream-values',
          content: [
            formatDataStreamPart('tool_call', {
              toolCallId: 'tool-call-0',
              toolName: 'test-tool',
              args: { testArg: 'test-value' },
            }),
          ],
        },
      ],
      async () => {
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
      },
    ),
  );
});

describe('file attachments with data url', () => {
  setupTestComponent(TestChatAttachmentsComponent);

  it('should handle text file attachment and submission', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Response to message with text attachment"\n'],
    });

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
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Response to message with image attachment"\n'],
    });

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
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Response to message with image attachment"\n'],
    });

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
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Response to empty message with attachment"\n'],
    });

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
    mockFetchDataStream({
      url: 'https://example.com/api/chat',
      chunks: ['0:"Response to message with image attachment"\n'],
    });

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
