import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import { consumeStream } from '../util/consume-stream';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
} from './process-ui-message-stream';
import type { UIMessage } from './ui-messages';

function createUIMessageStream(parts: UIMessageChunk[]) {
  return convertArrayToReadableStream(parts);
}

describe('issue #14688: resume against existing assistant message', () => {
  async function processAgainstLastMessage({
    lastMessage,
    chunks,
  }: {
    lastMessage: UIMessage;
    chunks: UIMessageChunk[];
  }) {
    const state = createStreamingUIMessageState({
      messageId: 'msg-123',
      lastMessage,
    });

    const runUpdateMessageJob = async (
      job: (options: {
        state: StreamingUIMessageState<UIMessage>;
        write: () => void;
      }) => Promise<void>,
    ) => {
      await job({
        state,
        write: () => {},
      });
    };

    await consumeStream({
      stream: processUIMessageStream({
        stream: createUIMessageStream(chunks),
        runUpdateMessageJob,
        onError: error => {
          throw error;
        },
      }),
    });

    return state.message;
  }

  it('does not duplicate text parts when text-start is replayed', async () => {
    const message = await processAgainstLastMessage({
      lastMessage: {
        id: 'msg-123',
        role: 'assistant',
        metadata: undefined,
        parts: [
          { type: 'step-start' },
          {
            type: 'text',
            text: 'Hello, world!',
            state: 'streaming',
            providerMetadata: undefined,
          },
        ],
      },
      chunks: [
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello, ' },
        { type: 'text-delta', id: 'text-1', delta: 'world!' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ],
    });

    expect(message.parts.filter(part => part.type === 'text')).toHaveLength(1);
  });

  it('does not duplicate reasoning parts when reasoning-start is replayed', async () => {
    const message = await processAgainstLastMessage({
      lastMessage: {
        id: 'msg-123',
        role: 'assistant',
        metadata: undefined,
        parts: [
          { type: 'step-start' },
          {
            type: 'reasoning',
            text: 'thinking...',
            state: 'streaming',
            providerMetadata: undefined,
          },
        ],
      },
      chunks: [
        { type: 'start', messageId: 'msg-123' },
        { type: 'start-step' },
        { type: 'reasoning-start', id: 'r-1' },
        { type: 'reasoning-delta', id: 'r-1', delta: 'thinking...' },
        { type: 'reasoning-end', id: 'r-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ],
    });

    expect(message.parts.filter(part => part.type === 'reasoning')).toHaveLength(
      1,
    );
  });
});
