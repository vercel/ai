import { mockId } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, effectScope, h, nextTick, ref } from 'vue';
import { setupTestComponent } from './setup-test-component';
import { useChat } from './use-chat';

function formatChunk(part: UIMessageChunk) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/chat': {},
});

function createControlledTransport() {
  let controller!: ReadableStreamDefaultController<UIMessageChunk>;
  const stream = new ReadableStream<UIMessageChunk>({
    start(streamController) {
      controller = streamController;
    },
  });

  return {
    controller,
    transport: {
      sendMessages: async () => stream,
      reconnectToStream: async () => null,
    } satisfies ChatTransport<UIMessage>,
  };
}

async function waitForCondition(condition: () => boolean) {
  for (let index = 0; index < 100; index++) {
    await Promise.resolve();
    await nextTick();

    if (condition()) {
      return;
    }
  }

  throw new Error('Condition was not met');
}

function getText(message: UIMessage | undefined) {
  return message?.parts
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('');
}

describe('useChat', () => {
  describe('initial messages', () => {
    setupTestComponent(
      defineComponent({
        setup() {
          const { messages } = useChat({
            messages: [
              {
                id: 'id-0',
                role: 'user',
                parts: [{ type: 'text', text: 'hi' }],
              },
            ],
          });
          return () =>
            h(
              'div',
              { 'data-testid': 'messages' },
              JSON.stringify(messages.value),
            );
        },
      }),
    );

    it('seeds messages from init', () => {
      expect(
        JSON.parse(screen.getByTestId('messages').textContent ?? ''),
      ).toStrictEqual([
        { id: 'id-0', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ]);
    });
  });

  describe('data protocol stream', () => {
    setupTestComponent(
      defineComponent({
        setup() {
          const { messages, status, error, sendMessage } = useChat({
            generateId: mockId(),
          });
          return () =>
            h('div', [
              h('div', { 'data-testid': 'status' }, status.value),
              error.value
                ? h('div', { 'data-testid': 'error' }, error.value.toString())
                : null,
              h(
                'div',
                { 'data-testid': 'messages' },
                JSON.stringify(messages.value),
              ),
              h('button', {
                'data-testid': 'do-send',
                onClick: () => sendMessage({ text: 'hi' }),
              }),
            ]);
        },
      }),
    );

    it('streams an assistant response and ends in ready status', async () => {
      server.urls['/api/chat'].response = {
        type: 'stream-chunks',
        chunks: [
          formatChunk({ type: 'text-start', id: '0' }),
          formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
          formatChunk({ type: 'text-delta', id: '0', delta: ', world.' }),
          formatChunk({ type: 'text-end', id: '0' }),
        ],
      };

      await userEvent.click(screen.getByTestId('do-send'));

      await waitFor(() => {
        expect(
          JSON.parse(screen.getByTestId('messages').textContent ?? ''),
        ).toStrictEqual([
          {
            id: 'id-1',
            role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
          },
          {
            id: 'id-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hello, world.', state: 'done' }],
          },
        ]);
      });
      expect(screen.getByTestId('status').textContent).toBe('ready');
    });

    it('surfaces server errors and sets status to error', async () => {
      server.urls['/api/chat'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      await userEvent.click(screen.getByTestId('do-send'));

      await screen.findByTestId('error');
      expect(screen.getByTestId('error').textContent).toBe('Error: Not found');
      expect(screen.getByTestId('status').textContent).toBe('error');
    });
  });

  describe('reactive init', () => {
    setupTestComponent(
      defineComponent({
        setup() {
          const which = ref<'a' | 'b'>('a');
          const { messages, id } = useChat(() => ({
            id: which.value,
            messages:
              which.value === 'a'
                ? [
                    {
                      id: 'm-1',
                      role: 'user',
                      parts: [{ type: 'text', text: 'first' }],
                    },
                  ]
                : [],
          }));
          return () =>
            h('div', [
              h('div', { 'data-testid': 'id' }, id.value),
              h(
                'div',
                { 'data-testid': 'message-count' },
                String(messages.value.length),
              ),
              h('button', {
                'data-testid': 'swap',
                onClick: () => (which.value = 'b'),
              }),
            ]);
        },
      }),
    );

    it('recreates the chat and resets messages when init changes', async () => {
      expect(screen.getByTestId('id').textContent).toBe('a');
      expect(screen.getByTestId('message-count').textContent).toBe('1');

      await userEvent.click(screen.getByTestId('swap'));

      await waitFor(() => {
        expect(screen.getByTestId('id').textContent).toBe('b');
      });
      expect(screen.getByTestId('message-count').textContent).toBe('0');
    });
  });

  describe('clearError', () => {
    setupTestComponent(
      defineComponent({
        setup() {
          const { error, sendMessage, clearError } = useChat();
          return () =>
            h('div', [
              error.value
                ? h('div', { 'data-testid': 'error' }, error.value.toString())
                : null,
              h('button', {
                'data-testid': 'do-send',
                onClick: () => sendMessage({ text: 'hi' }),
              }),
              h('button', {
                'data-testid': 'do-clear',
                onClick: () => clearError(),
              }),
            ]);
        },
      }),
    );

    it('removes the error after clearError is called', async () => {
      server.urls['/api/chat'].response = {
        type: 'error',
        status: 500,
        body: 'boom',
      };

      await userEvent.click(screen.getByTestId('do-send'));
      await screen.findByTestId('error');

      await userEvent.click(screen.getByTestId('do-clear'));

      await waitFor(() => {
        expect(screen.queryByTestId('error')).toBeNull();
      });
    });
  });

  describe('throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('publishes leading and trailing snapshots while callbacks remain immediate', async () => {
      const { controller, transport } = createControlledTransport();
      const onData = vi.fn();
      const onToolCall = vi.fn();
      const onFinish = vi.fn();
      const scope = effectScope();
      const chat = scope.run(() =>
        useChat({
          generateId: mockId(),
          onData,
          onFinish,
          onToolCall,
          throttle: 50,
          transport,
        }),
      )!;

      const request = chat.sendMessage({ text: 'hi' });
      await waitForCondition(() => chat.status.value === 'submitted');

      expect(chat.messages.value).toHaveLength(1);
      expect(getText(chat.messages.value[0])).toBe('hi');

      controller.enqueue({ type: 'text-start', id: '0' });
      controller.enqueue({ type: 'text-delta', id: '0', delta: 'Hel' });
      controller.enqueue({
        type: 'tool-input-available',
        toolCallId: 'tool-call-1',
        toolName: 'weather',
        input: { city: 'London' },
      });
      controller.enqueue({
        type: 'data-notification',
        data: { message: 'processing' },
        transient: true,
      } as UIMessageChunk);

      await waitForCondition(
        () =>
          onData.mock.calls.length === 1 && onToolCall.mock.calls.length === 1,
      );

      // The stream and callbacks have progressed, but the assistant snapshot
      // is still waiting for the throttle interval.
      expect(chat.status.value).toBe('streaming');
      expect(chat.messages.value).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(50);
      await waitForCondition(() => chat.messages.value.length === 2);
      expect(getText(chat.messages.value[1])).toBe('Hel');

      const publishedMessages = chat.messages.value;
      controller.enqueue({ type: 'text-delta', id: '0', delta: 'lo' });
      controller.enqueue({
        type: 'data-notification',
        data: { message: 'still processing' },
        transient: true,
      } as UIMessageChunk);
      await waitForCondition(() => onData.mock.calls.length === 2);

      // Published parts are snapshots, so unrelated reactive reads cannot
      // expose the live message before the next publication.
      expect(chat.messages.value).toBe(publishedMessages);
      expect(getText(chat.messages.value[1])).toBe('Hel');

      controller.close();
      await request;

      // Completion flushes the trailing snapshot instead of waiting for the
      // next interval.
      expect(chat.status.value).toBe('ready');
      expect(getText(chat.messages.value[1])).toBe('Hello');
      expect(onFinish).toHaveBeenCalledTimes(1);
      scope.stop();
    });

    it.each([undefined, 0])(
      'does not throttle message publications when throttle is %s',
      async throttle => {
        const { controller, transport } = createControlledTransport();
        const scope = effectScope();
        const chat = scope.run(() =>
          useChat({
            generateId: mockId(),
            throttle,
            transport,
          }),
        )!;

        const request = chat.sendMessage({ text: 'hi' });
        await waitForCondition(() => chat.status.value === 'submitted');

        controller.enqueue({ type: 'text-start', id: '0' });
        controller.enqueue({ type: 'text-delta', id: '0', delta: 'Hello' });
        await waitForCondition(
          () => getText(chat.messages.value[1]) === 'Hello',
        );

        controller.close();
        await request;
        scope.stop();
      },
    );

    it('flushes the latest snapshot before error status is observable', async () => {
      const { controller, transport } = createControlledTransport();
      const scope = effectScope();
      const chat = scope.run(() =>
        useChat({
          generateId: mockId(),
          throttle: 50,
          transport,
        }),
      )!;

      const request = chat.sendMessage({ text: 'hi' });
      await waitForCondition(() => chat.status.value === 'submitted');

      controller.enqueue({ type: 'text-start', id: '0' });
      controller.enqueue({ type: 'text-delta', id: '0', delta: 'Hello' });
      controller.enqueue({ type: 'error', errorText: 'stream failed' });
      controller.close();
      await request;

      expect(chat.status.value).toBe('error');
      expect(chat.error.value?.message).toBe('stream failed');
      expect(getText(chat.messages.value[1])).toBe('Hello');
      scope.stop();
    });

    it('flushes the latest snapshot when an aborted request becomes ready', async () => {
      const { controller, transport } = createControlledTransport();
      const onData = vi.fn();
      const scope = effectScope();
      const chat = scope.run(() =>
        useChat({
          generateId: mockId(),
          onData,
          throttle: 50,
          transport,
        }),
      )!;

      const request = chat.sendMessage({ text: 'hi' });
      await waitForCondition(() => chat.status.value === 'submitted');

      controller.enqueue({ type: 'text-start', id: '0' });
      controller.enqueue({ type: 'text-delta', id: '0', delta: 'Hello' });
      controller.enqueue({
        type: 'data-notification',
        data: { message: 'processed' },
        transient: true,
      } as UIMessageChunk);
      await waitForCondition(() => onData.mock.calls.length === 1);
      expect(chat.messages.value).toHaveLength(1);

      await chat.stop();
      await request;

      expect(chat.status.value).toBe('ready');
      expect(getText(chat.messages.value[1])).toBe('Hello');
      scope.stop();
    });

    it('cancels pending publications when the reactive chat is replaced', async () => {
      const { controller, transport } = createControlledTransport();
      const id = ref('first-chat');
      const scope = effectScope();
      const chat = scope.run(() =>
        useChat(() => ({
          generateId: mockId(),
          id: id.value,
          throttle: 50,
          transport,
        })),
      )!;

      const request = chat.sendMessage({ text: 'hi' });
      await waitForCondition(() => chat.status.value === 'submitted');
      controller.enqueue({ type: 'text-start', id: '0' });
      controller.enqueue({ type: 'text-delta', id: '0', delta: 'Hello' });
      await waitForCondition(() => chat.status.value === 'streaming');

      id.value = 'second-chat';
      await nextTick();
      expect(chat.id.value).toBe('second-chat');
      expect(chat.messages.value).toEqual([]);

      await vi.advanceTimersByTimeAsync(50);
      expect(chat.messages.value).toEqual([]);

      controller.close();
      await request;
      expect(chat.status.value).toBe('ready');
      scope.stop();
    });

    it('cancels pending publications when the composable scope is disposed', async () => {
      const { controller, transport } = createControlledTransport();
      const scope = effectScope();
      const chat = scope.run(() =>
        useChat({
          generateId: mockId(),
          throttle: 50,
          transport,
        }),
      )!;

      const request = chat.sendMessage({ text: 'hi' });
      await waitForCondition(() => chat.status.value === 'submitted');
      controller.enqueue({ type: 'text-start', id: '0' });
      controller.enqueue({ type: 'text-delta', id: '0', delta: 'Hello' });
      await waitForCondition(() => chat.status.value === 'streaming');

      scope.stop();
      await vi.advanceTimersByTimeAsync(50);
      expect(chat.messages.value).toHaveLength(1);

      controller.close();
      await request;
      expect(chat.messages.value).toHaveLength(1);
    });
  });
});
