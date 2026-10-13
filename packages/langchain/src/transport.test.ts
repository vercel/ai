import { LangSmithDeploymentTransport } from './transport';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { UIMessage } from 'ai';
import { describe, it, expect, vi } from 'vitest';

function mockGraphStream(
  transport: LangSmithDeploymentTransport<UIMessage>,
): ReturnType<typeof vi.fn> {
  const stream = vi.fn(async () => (async function* () {})());

  Object.assign(transport, {
    graph: { stream },
  });

  return stream;
}

const messages = [
  {
    id: 'user-1',
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: 'Hello' }],
  },
];

describe('LangSmithDeploymentTransport', () => {
  it('should create transport with options', () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      apiKey: 'test-key',
    });

    expect('sendMessages' in transport).toBe(true);
    expect('reconnectToStream' in transport).toBe(true);
  });

  it('should create transport with only url', () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });

    expect('sendMessages' in transport).toBe(true);
  });

  it('should create transport with custom graphId', () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      graphId: 'custom-agent',
    });

    expect('sendMessages' in transport).toBe(true);
  });

  it('should throw error for reconnectToStream', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });

    await expect(
      transport.reconnectToStream({ chatId: 'chat-1' }),
    ).rejects.toThrow('Method not implemented.');
  });

  it('uses prepared RemoteGraph configuration for each request', async () => {
    const prepareRemoteGraphConfig = vi.fn(
      async ({
        chatId,
        body,
      }: {
        chatId: string;
        body?: object;
      }): Promise<RunnableConfig> => ({
        configurable: {
          thread_id: (body as { threadId: string }).threadId,
        },
        metadata: { chatId },
        tags: [`chat:${chatId}`],
      }),
    );
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      prepareRemoteGraphConfig,
    });
    const stream = mockGraphStream(transport);

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-a',
      messageId: undefined,
      messages,
      abortSignal: undefined,
      body: { threadId: 'thread-a' },
    });
    await transport.sendMessages({
      trigger: 'regenerate-message',
      chatId: 'chat-b',
      messageId: 'assistant-1',
      messages,
      abortSignal: undefined,
      body: { threadId: 'thread-b' },
    });

    expect(prepareRemoteGraphConfig).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trigger: 'submit-message',
        chatId: 'chat-a',
        messageId: undefined,
        messages,
        body: { threadId: 'thread-a' },
      }),
    );
    expect(prepareRemoteGraphConfig).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        trigger: 'regenerate-message',
        chatId: 'chat-b',
        messageId: 'assistant-1',
        messages,
        body: { threadId: 'thread-b' },
      }),
    );
    expect(stream.mock.calls[0]?.[1]).toEqual({
      configurable: { thread_id: 'thread-a' },
      metadata: { chatId: 'chat-a' },
      tags: ['chat:chat-a'],
      streamMode: ['values', 'messages'],
    });
    expect(stream.mock.calls[1]?.[1]).toEqual({
      configurable: { thread_id: 'thread-b' },
      metadata: { chatId: 'chat-b' },
      tags: ['chat:chat-b'],
      streamMode: ['values', 'messages'],
    });
  });

  it('does not forward request fields without explicit preparation', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });
    const stream = mockGraphStream(transport);

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-a',
      messageId: undefined,
      messages,
      abortSignal: undefined,
      body: { configurable: { thread_id: 'thread-a' } },
      metadata: { caseId: 'case-a' },
    });

    expect(stream.mock.calls[0]?.[1]).toEqual({
      streamMode: ['values', 'messages'],
    });
  });

  it('preserves required stream modes', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      prepareRemoteGraphConfig: () =>
        ({
          configurable: { thread_id: 'thread-a' },
          streamMode: ['custom'],
        }) as RunnableConfig,
    });
    const stream = mockGraphStream(transport);

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-a',
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });

    expect(stream.mock.calls[0]?.[1]).toEqual({
      configurable: { thread_id: 'thread-a' },
      streamMode: ['values', 'messages'],
    });
  });

  it('forwards the request abort signal to RemoteGraph', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });
    const stream = mockGraphStream(transport);
    const controller = new AbortController();

    await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'chat-a',
      messageId: undefined,
      messages,
      abortSignal: controller.signal,
    });

    expect(stream.mock.calls[0]?.[1]).toEqual({
      signal: controller.signal,
      streamMode: ['values', 'messages'],
    });
  });

  it('does not call RemoteGraph for an already-aborted request', async () => {
    const error = new Error('request aborted');
    const prepareRemoteGraphConfig = vi.fn(() => ({
      configurable: { thread_id: 'thread-a' },
    }));
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      prepareRemoteGraphConfig,
    });
    const stream = mockGraphStream(transport);
    const controller = new AbortController();
    controller.abort(error);

    await expect(
      transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-a',
        messageId: undefined,
        messages,
        abortSignal: controller.signal,
      }),
    ).rejects.toBe(error);
    expect(prepareRemoteGraphConfig).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
  });

  it.each(['request', 'prepared'] as const)(
    'composes request and prepared abort signals when the %s signal aborts',
    async source => {
      const preparedController = new AbortController();
      const transport = new LangSmithDeploymentTransport({
        url: 'https://test.langsmith.app',
        prepareRemoteGraphConfig: () => ({
          signal: preparedController.signal,
        }),
      });
      const stream = mockGraphStream(transport);
      const requestController = new AbortController();

      await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-a',
        messageId: undefined,
        messages,
        abortSignal: requestController.signal,
      });

      const signal = stream.mock.calls[0]?.[1].signal as AbortSignal;
      const error = new Error(`${source} aborted`);
      const controller =
        source === 'request' ? requestController : preparedController;
      controller.abort(error);

      expect(signal).not.toBe(requestController.signal);
      expect(signal).not.toBe(preparedController.signal);
      expect(signal.aborted).toBe(true);
      expect(signal.reason).toBe(error);
    },
  );

  it('does not call RemoteGraph when a prepared signal is already aborted', async () => {
    const error = new Error('prepared signal aborted');
    const controller = new AbortController();
    controller.abort(error);
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      prepareRemoteGraphConfig: () => ({
        signal: controller.signal,
      }),
    });
    const stream = mockGraphStream(transport);

    await expect(
      transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-a',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      }),
    ).rejects.toBe(error);
    expect(stream).not.toHaveBeenCalled();
  });

  it('does not call RemoteGraph when configuration preparation fails', async () => {
    const error = new Error('configuration failed');
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
      prepareRemoteGraphConfig: async () => {
        throw error;
      },
    });
    const stream = mockGraphStream(transport);

    await expect(
      transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-a',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      }),
    ).rejects.toBe(error);
    expect(stream).not.toHaveBeenCalled();
  });
});
