import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { streamText } from './stream-text';

describe('streamText onFinish with abort', () => {
  it('should call onFinish when stream is aborted via AbortController', async () => {
    const onFinishCallback = vi.fn();
    const abortController = new AbortController();

    const model = new MockLanguageModelV2({
      doStream: async ({ abortSignal }) => {
        const stream = new ReadableStream({
          async start(controller) {
            const onAbort = () => {
              controller.error(new DOMException('Aborted', 'AbortError'));
            };
            abortSignal?.addEventListener('abort', onAbort, { once: true });

            controller.enqueue({
              type: 'response-metadata',
              id: 'msg-1',
              modelId: 'test-model',
              timestamp: new Date(),
            });
            controller.enqueue({ type: 'text-start', id: '1' });
            controller.enqueue({ type: 'text-delta', id: '1', delta: 'Hello' });
            controller.enqueue({
              type: 'text-delta',
              id: '1',
              delta: ' world',
            });

            await new Promise(resolve => setTimeout(resolve, 10));

            if (!abortSignal?.aborted) {
              controller.enqueue({
                type: 'text-delta',
                id: '1',
                delta: ' from AI',
              });
              controller.enqueue({ type: 'text-end', id: '1' });
              controller.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
              });
              controller.close();
            }
          },
        });

        return { stream };
      },
    });

    const result = streamText({
      model,
      prompt: 'Say hello',
      abortSignal: abortController.signal,
    });

    const uiStream = result.toUIMessageStream({
      onFinish: onFinishCallback,
    });

    const reader = uiStream.getReader();
    const chunks = [];

    for (let i = 0; i < 3; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    abortController.abort();
    const { value: abortChunk } = await reader.read();
    expect(abortChunk?.type).toBe('abort');

    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(onFinishCallback).toHaveBeenCalledTimes(1);
    const callArgs = onFinishCallback.mock.calls[0][0];
    expect(callArgs.responseMessage).toBeDefined();
    expect(callArgs.responseMessage.role).toBe('assistant');
    const textPart = callArgs.responseMessage.parts.find(
      (p: any) => p.type === 'text',
    );
    expect(textPart).toBeDefined();
    expect(textPart.text).toBe(''); // Text was not streamed yet when aborted
    expect(callArgs.isAborted).toBe(true); // Stream was aborted

    reader.releaseLock();
  });

  it('should call onFinish when reader.cancel() is called', async () => {
    const onFinishCallback = vi.fn();

    const model = new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'response-metadata',
            id: 'msg-2',
            modelId: 'test-model',
            timestamp: new Date(),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'Streaming' },
          { type: 'text-delta', id: '1', delta: ' content' },
          { type: 'text-delta', id: '1', delta: ' that' },
          { type: 'text-delta', id: '1', delta: ' will' },
          { type: 'text-delta', id: '1', delta: ' be' },
          { type: 'text-delta', id: '1', delta: ' cancelled' },
        ]),
      }),
    });

    const result = streamText({
      model,
      prompt: 'Generate content',
    });

    const uiStream = result.toUIMessageStream({
      onFinish: onFinishCallback,
    });

    const reader = uiStream.getReader();
    const chunks = [];
    for (let i = 0; i < 4; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    await reader.cancel();
    reader.releaseLock();

    expect(onFinishCallback).toHaveBeenCalledTimes(1);
    const callArgs = onFinishCallback.mock.calls[0][0];
    expect(callArgs.responseMessage).toBeDefined();
    expect(callArgs.responseMessage.role).toBe('assistant');
    const textPart = callArgs.responseMessage.parts.find(
      (p: any) => p.type === 'text',
    );
    expect(textPart).toBeDefined();
    expect(textPart.text).toContain('Streaming'); // Partial content
    expect(textPart.state).toBe('streaming');
    expect(callArgs.isAborted).toBe(false); // Stream was cancelled, not aborted
  });

  it('should call onFinish when fetch-like abort happens during streaming', async () => {
    const onFinishCallback = vi.fn();
    const abortController = new AbortController();

    const model = new MockLanguageModelV2({
      doStream: async ({ abortSignal }) => {
        let streamController: ReadableStreamDefaultController;

        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;

            const onAbort = () => {
              controller.error(
                new DOMException('The operation was aborted', 'AbortError'),
              );
            };
            abortSignal?.addEventListener('abort', onAbort, { once: true });

            controller.enqueue({
              type: 'response-metadata',
              id: 'msg-3',
              modelId: 'test-model',
              timestamp: new Date(),
            });
            controller.enqueue({ type: 'text-start', id: '1' });
            controller.enqueue({
              type: 'text-delta',
              id: '1',
              delta: 'Processing',
            });
            controller.enqueue({ type: 'text-delta', id: '1', delta: ' your' });
            controller.enqueue({
              type: 'text-delta',
              id: '1',
              delta: ' request',
            });

            setTimeout(() => {
              if (!abortSignal?.aborted) {
                try {
                  controller.enqueue({
                    type: 'text-delta',
                    id: '1',
                    delta: '...',
                  });
                  controller.enqueue({
                    type: 'text-delta',
                    id: '1',
                    delta: ' More content',
                  });
                } catch (e) {}
              }
            }, 100);
          },
        });

        return { stream };
      },
    });

    const result = streamText({
      model,
      prompt: 'Process this request',
      abortSignal: abortController.signal,
    });

    const uiStream = result.toUIMessageStream({
      onFinish: onFinishCallback,
      generateMessageId: () => 'test-message-id',
    });

    const chunks: any[] = [];
    const consume = async () => {
      try {
        for await (const chunk of uiStream) {
          chunks.push(chunk);
          if (chunks.length === 4) {
            abortController.abort();
          }
        }
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('AbortError');
      }
    };

    await consume();

    expect(onFinishCallback).toHaveBeenCalledTimes(1);
    const callArgs = onFinishCallback.mock.calls[0][0];
    expect(callArgs.responseMessage.id).toBe('test-message-id');
    expect(callArgs.responseMessage.role).toBe('assistant');
    const textPart = callArgs.responseMessage.parts.find(
      (p: any) => p.type === 'text',
    );
    expect(textPart).toBeDefined();
    expect(textPart.text).toBe('Processing your'); // Only partial text before abort
    expect(textPart.state).toBe('streaming');
    expect(callArgs.isAborted).toBe(true); // Stream was aborted
  });

  it('should call onFinish when async iteration stops mid-stream', async () => {
    const onFinishCallback = vi.fn();

    const model = new MockLanguageModelV2({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: 'response-metadata',
            id: 'msg-4',
            modelId: 'test-model',
            timestamp: new Date(),
          },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'First' },
          { type: 'text-delta', id: '1', delta: ' chunk' },
          { type: 'text-delta', id: '1', delta: ' of' },
          { type: 'text-delta', id: '1', delta: ' text' },
          { type: 'text-delta', id: '1', delta: ' that' },
          { type: 'text-delta', id: '1', delta: ' will' },
          { type: 'text-delta', id: '1', delta: ' be' },
          { type: 'text-delta', id: '1', delta: ' interrupted' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          },
        ]),
      }),
    });

    const result = streamText({
      model,
      prompt: 'Generate text',
    });

    const uiStream = result.toUIMessageStream({
      onFinish: onFinishCallback,
      generateMessageId: () => 'msg-async-iter',
    });

    let chunkCount = 0;
    const collectedChunks: any[] = [];

    for await (const chunk of uiStream) {
      collectedChunks.push(chunk);
      chunkCount++;

      if (chunkCount >= 5) {
        break;
      }
    }

    expect(chunkCount).toBe(5);
    expect(collectedChunks).toHaveLength(5);

    expect(onFinishCallback).toHaveBeenCalledTimes(1);
    const callArgs = onFinishCallback.mock.calls[0][0];
    expect(callArgs.responseMessage.id).toBe('msg-async-iter');
    expect(callArgs.responseMessage.role).toBe('assistant');

    const textPart = callArgs.responseMessage.parts.find(
      (p: any) => p.type === 'text',
    );
    expect(textPart).toBeDefined();
    expect(textPart.text).toContain('First chunk'); // Should have at least the first parts
    expect(textPart.state).toBe('streaming');
    expect(callArgs.isAborted).toBe(false); // No explicit abort, just stopped iteration
  });
});
