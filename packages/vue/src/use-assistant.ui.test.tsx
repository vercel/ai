import { formatAssistantStreamPart } from '@ai-sdk/ui-utils';
import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, findByText, render, screen } from '@testing-library/vue';
import TestChatAssistantStreamComponent from './TestChatAssistantStreamComponent.vue';
import TestChatAssistantThreadChangeComponent from './TestChatAssistantThreadChangeComponent.vue';
import { setupTestComponent } from './setup-test-component';

const server = createTestServer({
  '/api/assistant': {},
});

describe('stream data stream', () => {
  setupTestComponent(TestChatAssistantStreamComponent);

  it('should show streamed response', async () => {
    server.urls['/api/assistant'].response = {
      type: 'stream-chunks',
      chunks: [
        // Format the stream part
        formatAssistantStreamPart('assistant_control_data', {
          threadId: 't0',
          messageId: 'm0',
        }),
        formatAssistantStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // Text parts
        '0:"Hello"\n',
        '0:", world"\n',
        '0:"."\n',
      ],
    };

    // Click the button
    await userEvent.click(screen.getByTestId('do-append'));

    // Find the message-0 element
    await screen.findByTestId('message-0');
    // Expect the message-0 element to have the text content 'User: hi'
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    // Find the message-1 element
    await screen.findByTestId('message-1');
    // Expect the message-1 element to have the text content 'AI: Hello, world.'
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      message: 'hi',
      threadId: null,
    });
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
      const controller = new TestResponseController();
      server.urls['/api/assistant'].response = {
        type: 'controlled-stream',
        controller,
      };

      await userEvent.click(screen.getByTestId('do-append'));

      // Find the loading element and expect it to be in progress
      await screen.findByTestId('status');
      expect(screen.getByTestId('status')).toHaveTextContent('in_progress');

      controller.write(
        formatAssistantStreamPart('assistant_control_data', {
          threadId: 't0',
          messageId: 'm1',
        }),
      );

      controller.write(
        formatAssistantStreamPart('assistant_message', {
          id: 'm1',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
      );

      controller.write('0:"Hello"\n');
      controller.close();

      await findByText(await screen.findByTestId('status'), 'awaiting_message');
      expect(screen.getByTestId('status')).toHaveTextContent(
        'awaiting_message',
      );
    });
  });
});

describe('Thread management', () => {
  beforeEach(() => {
    render(TestChatAssistantThreadChangeComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('create new thread', async () => {
    await screen.findByTestId('thread-id');
    expect(screen.getByTestId('thread-id')).toHaveTextContent('undefined');
  });

  it('should show streamed response', async () => {
    server.urls['/api/assistant'].response = {
      type: 'stream-chunks',
      chunks: [
        formatAssistantStreamPart('assistant_control_data', {
          threadId: 't0',
          messageId: 'm0',
        }),
        formatAssistantStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // text parts:
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(screen.getByTestId('thread-id')).toHaveTextContent('t0');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      message: 'hi',
      threadId: null,
    });
  });

  it('should switch to new thread on setting undefined threadId', async () => {
    await userEvent.click(screen.getByTestId('do-new-thread'));

    expect(screen.queryByTestId('message-0')).toBeNull();
    expect(screen.queryByTestId('message-1')).toBeNull();

    server.urls['/api/assistant'].response = {
      type: 'stream-chunks',
      chunks: [
        formatAssistantStreamPart('assistant_control_data', {
          threadId: 't1',
          messageId: 'm0',
        }),
        formatAssistantStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(screen.getByTestId('thread-id')).toHaveTextContent('t1');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    // check that correct information was sent to the server:
    expect(await server.calls[0].requestBody).toStrictEqual({
      message: 'hi',
      threadId: null,
    });
  });

  it('should switch to thread on setting previously created threadId', async () => {
    await userEvent.click(screen.getByTestId('do-thread-3'));

    expect(screen.queryByTestId('message-0')).toBeNull();
    expect(screen.queryByTestId('message-1')).toBeNull();

    server.urls['/api/assistant'].response = {
      type: 'stream-chunks',
      chunks: [
        formatAssistantStreamPart('assistant_control_data', {
          threadId: 't3',
          messageId: 'm0',
        }),
        formatAssistantStreamPart('assistant_message', {
          id: 'm0',
          role: 'assistant',
          content: [{ type: 'text', text: { value: '' } }],
        }),
        // text parts:
        '0:"Hello"\n',
        '0:","\n',
        '0:" world"\n',
        '0:"."\n',
      ],
    };

    await userEvent.click(screen.getByTestId('do-append'));

    await screen.findByTestId('message-0');
    expect(screen.getByTestId('message-0')).toHaveTextContent('User: hi');

    expect(screen.getByTestId('thread-id')).toHaveTextContent('t3');

    await screen.findByTestId('message-1');
    expect(screen.getByTestId('message-1')).toHaveTextContent(
      'AI: Hello, world.',
    );

    expect(await server.calls[0].requestBody).toStrictEqual({
      message: 'hi',
      threadId: 't3',
    });
  });
});
