import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { UIMessage } from '../ui/ui-messages';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import { UIMessageChunk } from './ui-message-chunks';

function createUIMessageStream(parts: UIMessageChunk[]) {
  return convertArrayToReadableStream(parts);
}

describe('handleUIMessageStreamFinish', () => {
  const mockErrorHandler = vi.fn();

  beforeEach(() => {
    mockErrorHandler.mockClear();
  });

  describe('stream pass-through without onFinish', () => {
    it('should pass through stream chunks without processing when onFinish is not provided', async () => {
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-123' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        { type: 'text-delta', id: 'text-1', delta: ' World' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-123',
        originalMessages: [],
        onError: mockErrorHandler,
        // onFinish is not provided
      });

      const result = await convertReadableStreamToArray(resultStream);

      expect(result).toEqual(inputChunks);
      expect(mockErrorHandler).not.toHaveBeenCalled();
    });

    it('should inject messageId when not present in start chunk', async () => {
      const inputChunks: UIMessageChunk[] = [
        { type: 'start' }, // no messageId
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Test' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'injected-123',
        originalMessages: [],
        onError: mockErrorHandler,
      });

      const result = await convertReadableStreamToArray(resultStream);

      expect(result[0]).toEqual({ type: 'start', messageId: 'injected-123' });
      expect(result.slice(1)).toEqual(inputChunks.slice(1));
    });
  });

  describe('stream processing with onFinish callback', () => {
    it('should process stream and call onFinish with correct parameters', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-456' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        { type: 'text-delta', id: 'text-1', delta: ' World' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const originalMessages: UIMessage[] = [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-456',
        originalMessages,
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      const result = await convertReadableStreamToArray(resultStream);

      expect(result).toEqual(inputChunks);
      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isContinuation).toBe(false);
      expect(callArgs.responseMessage.id).toBe('msg-456');
      expect(callArgs.responseMessage.role).toBe('assistant');
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0]).toEqual(originalMessages[0]);
      expect(callArgs.messages[1]).toEqual(callArgs.responseMessage);
    });

    it('should handle empty original messages array', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-789' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Response' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-789',
        originalMessages: [],
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      await convertReadableStreamToArray(resultStream);

      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isContinuation).toBe(false);
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0]).toEqual(callArgs.responseMessage);
    });
  });

  describe('stream processing with continuation scenario', () => {
    it('should handle continuation when last message is assistant', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'assistant-msg-1' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: ' continued' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const originalMessages: UIMessage[] = [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Continue this' }],
        },
        {
          id: 'assistant-msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'This is' }],
        },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-999', // this should be ignored since we're continuing
        originalMessages,
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      await convertReadableStreamToArray(resultStream);

      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isContinuation).toBe(true);
      expect(callArgs.responseMessage.id).toBe('assistant-msg-1'); // uses the existing assistant message id
      expect(callArgs.messages).toHaveLength(2); // original user message + updated assistant message
      expect(callArgs.messages[0]).toEqual(originalMessages[0]);
      expect(callArgs.messages[1]).toEqual(callArgs.responseMessage);
    });

    it('should not treat user message as continuation', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-001' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'New response' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const originalMessages: UIMessage[] = [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Question' }],
        },
        {
          id: 'user-msg-2',
          role: 'user',
          parts: [{ type: 'text', text: 'Another question' }],
        },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-001',
        originalMessages,
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      await convertReadableStreamToArray(resultStream);

      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isContinuation).toBe(false);
      expect(callArgs.responseMessage.id).toBe('msg-001');
      expect(callArgs.messages).toHaveLength(3); // 2 user messages + 1 new assistant message
    });
  });

  describe('abort scenarios', () => {
    it('should set isAborted to true when abort chunk is encountered', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-abort-1' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Starting text' },
        { type: 'abort' },
        { type: 'finish' },
      ];

      const originalMessages: UIMessage[] = [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Test request' }],
        },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-abort-1',
        originalMessages,
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      const result = await convertReadableStreamToArray(resultStream);

      expect(result).toEqual(inputChunks);
      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isAborted).toBe(true);
      expect(callArgs.isContinuation).toBe(false);
      expect(callArgs.responseMessage.id).toBe('msg-abort-1');
      expect(callArgs.messages).toHaveLength(2);
    });

    it('should set isAborted to false when no abort chunk is encountered', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-normal' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Complete text' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish' },
      ];

      const originalMessages: UIMessage[] = [
        {
          id: 'user-msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Test request' }],
        },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-normal',
        originalMessages,
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      await convertReadableStreamToArray(resultStream);

      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isAborted).toBe(false);
      expect(callArgs.isContinuation).toBe(false);
      expect(callArgs.responseMessage.id).toBe('msg-normal');
    });

    it('should handle abort chunk in pass-through mode without onFinish', async () => {
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-abort-passthrough' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Text before abort' },
        { type: 'abort' },
        { type: 'finish' },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-abort-passthrough',
        originalMessages: [],
        onError: mockErrorHandler,
        // onFinish is not provided
      });

      const result = await convertReadableStreamToArray(resultStream);

      expect(result).toEqual(inputChunks);
      expect(mockErrorHandler).not.toHaveBeenCalled();
    });

    it('should handle multiple abort chunks correctly', async () => {
      const onFinishCallback = vi.fn();
      const inputChunks: UIMessageChunk[] = [
        { type: 'start', messageId: 'msg-multiple-abort' },
        { type: 'text-start', id: 'text-1' },
        { type: 'abort' },
        { type: 'text-delta', id: 'text-1', delta: 'Some text' },
        { type: 'abort' },
        { type: 'finish' },
      ];

      const stream = createUIMessageStream(inputChunks);

      const resultStream = handleUIMessageStreamFinish<UIMessage>({
        stream,
        messageId: 'msg-multiple-abort',
        originalMessages: [],
        onError: mockErrorHandler,
        onFinish: onFinishCallback,
      });

      const result = await convertReadableStreamToArray(resultStream);

      expect(result).toEqual(inputChunks);
      expect(onFinishCallback).toHaveBeenCalledTimes(1);

      const callArgs = onFinishCallback.mock.calls[0][0];
      expect(callArgs.isAborted).toBe(true);
    });
  });
});
