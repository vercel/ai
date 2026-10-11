import { LangSmithDeploymentTransport } from './transport';
import type { UIMessage } from 'ai';
import { describe, it, expect } from 'vitest';

type GraphStream = (
  input: unknown,
  options: {
    streamMode: string[];
    signal?: AbortSignal;
  },
) => Promise<AsyncIterable<unknown>>;

function replaceGraphStream(
  transport: LangSmithDeploymentTransport<UIMessage>,
  stream: GraphStream,
) {
  (
    transport as unknown as {
      graph: { stream: GraphStream };
    }
  ).graph = { stream };
}

function createSendMessagesOptions(abortSignal?: AbortSignal) {
  return {
    trigger: 'submit-message' as const,
    chatId: 'chat-1',
    messageId: undefined,
    messages: [
      {
        id: 'user-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Hello' }],
      },
    ],
    abortSignal,
  };
}

async function* createEmptyStream() {}

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

  it('should forward the abort signal to a pending graph stream', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });
    const controller = new AbortController();
    const abortReason = new Error('user stopped');
    let receivedSignal: AbortSignal | undefined;
    let markStreamStarted: () => void;
    const streamStarted = new Promise<void>(resolve => {
      markStreamStarted = resolve;
    });

    replaceGraphStream(transport, async (_input, options) => {
      receivedSignal = options.signal;
      markStreamStarted();

      return new Promise((_, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason),
          { once: true },
        );
      });
    });

    const result = transport.sendMessages(
      createSendMessagesOptions(controller.signal),
    );

    await streamStarted;
    expect(receivedSignal).toBe(controller.signal);

    controller.abort(abortReason);

    await expect(result).rejects.toBe(abortReason);
  });

  it('should reject an already aborted request before starting the graph stream', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });
    const controller = new AbortController();
    const abortReason = new Error('user stopped');
    let streamCallCount = 0;

    replaceGraphStream(transport, async () => {
      streamCallCount++;
      return createEmptyStream();
    });

    controller.abort(abortReason);

    await expect(
      transport.sendMessages(createSendMessagesOptions(controller.signal)),
    ).rejects.toBe(abortReason);
    expect(streamCallCount).toBe(0);
  });

  it('should start the graph stream when no abort signal is provided', async () => {
    const transport = new LangSmithDeploymentTransport({
      url: 'https://test.langsmith.app',
    });
    let receivedSignal: AbortSignal | undefined;

    replaceGraphStream(transport, async (_input, options) => {
      receivedSignal = options.signal;
      return createEmptyStream();
    });

    const result = await transport.sendMessages(createSendMessagesOptions());

    expect(receivedSignal).toBeUndefined();
    expect(result).toBeInstanceOf(ReadableStream);
  });
});
