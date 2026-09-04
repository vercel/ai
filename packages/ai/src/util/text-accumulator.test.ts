import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
} from '../ui/process-ui-message-stream';
import type { UIMessage } from '../ui/ui-messages';
import { consumeStream } from './consume-stream';
import {
  appendToTextAccumulator,
  finalizeTextAccumulator,
  prepareTextAccumulator,
} from './text-accumulator';
import { describe, expect, it } from 'vitest';

function createUIMessageStream(parts: UIMessageChunk[]) {
  return convertArrayToReadableStream(parts);
}

describe('text accumulator', () => {
  it('accumulates real streaming text chunks lazily', async () => {
    const stream = createUIMessageStream([
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Hel' },
      { type: 'text-delta', id: 'text-1', delta: 'lo ' },
      { type: 'text-delta', id: 'text-1', delta: 'wor' },
      { type: 'text-delta', id: 'text-1', delta: 'ld' },
      { type: 'text-end', id: 'text-1' },
    ]);

    const state = createStreamingUIMessageState<UIMessage>({
      messageId: 'msg-1',
      lastMessage: undefined,
    });
    const writeCalls: Array<{
      text: string;
      descriptor: PropertyDescriptor | undefined;
      snapshot: UIMessage;
    }> = [];

    const runUpdateMessageJob = async (
      job: (options: {
        state: StreamingUIMessageState<UIMessage>;
        write: () => void;
      }) => Promise<void>,
    ) => {
      await job({
        state,
        write: () => {
          const textPart = state.message.parts.find(
            part => part.type === 'text',
          );

          writeCalls.push({
            text: textPart?.text ?? '',
            descriptor:
              textPart == null
                ? undefined
                : Object.getOwnPropertyDescriptor(textPart, 'text'),
            snapshot: structuredClone(state.message),
          });
        },
      });
    };

    await consumeStream({
      stream: processUIMessageStream({
        stream,
        runUpdateMessageJob,
        onError: error => {
          throw error;
        },
      }),
    });

    expect(writeCalls.map(call => call.text)).toEqual([
      '',
      'Hel',
      'Hello ',
      'Hello wor',
      'Hello world',
      'Hello world',
    ]);
    expect(writeCalls.map(call => call.snapshot.parts)).toEqual([
      [
        {
          providerMetadata: undefined,
          state: 'streaming',
          text: '',
          type: 'text',
        },
      ],
      [
        {
          providerMetadata: undefined,
          state: 'streaming',
          text: 'Hel',
          type: 'text',
        },
      ],
      [
        {
          providerMetadata: undefined,
          state: 'streaming',
          text: 'Hello ',
          type: 'text',
        },
      ],
      [
        {
          providerMetadata: undefined,
          state: 'streaming',
          text: 'Hello wor',
          type: 'text',
        },
      ],
      [
        {
          providerMetadata: undefined,
          state: 'streaming',
          text: 'Hello world',
          type: 'text',
        },
      ],
      [
        {
          providerMetadata: undefined,
          state: 'done',
          text: 'Hello world',
          type: 'text',
        },
      ],
    ]);

    expect(
      writeCalls.slice(0, -1).every(call => call.descriptor?.get != null),
    ).toBe(true);
    expect(writeCalls.at(-1)?.descriptor).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'Hello world',
    });
  });

  it('keeps text lazy while appending chunks', () => {
    const part = prepareTextAccumulator({ type: 'text', text: '' });

    appendToTextAccumulator({ part, textDelta: 'Hel' });
    appendToTextAccumulator({ part, textDelta: 'lo' });

    const descriptorAfterAppend = Object.getOwnPropertyDescriptor(part, 'text');

    expect(descriptorAfterAppend?.get).toBeDefined();
    expect(descriptorAfterAppend?.set).toBeDefined();
    expect(descriptorAfterAppend?.enumerable).toBe(true);
    expect(part.text).toBe('Hello');

    appendToTextAccumulator({ part, textDelta: '!' });

    const descriptorAfterReadAndAppend = Object.getOwnPropertyDescriptor(
      part,
      'text',
    );

    expect(descriptorAfterReadAndAppend?.get).toBeDefined();
    expect(part.text).toBe('Hello!');
  });

  it('keeps text enumerable and internal state hidden from serialization', () => {
    const part = prepareTextAccumulator({
      type: 'text',
      text: '',
      state: 'streaming',
    });

    appendToTextAccumulator({ part, textDelta: 'Hello' });
    appendToTextAccumulator({ part, textDelta: ' world' });

    expect(Object.keys(part)).toEqual(['type', 'text', 'state']);
    expect({ ...part }).toEqual({
      type: 'text',
      text: 'Hello world',
      state: 'streaming',
    });
    expect(JSON.parse(JSON.stringify(part))).toEqual({
      type: 'text',
      text: 'Hello world',
      state: 'streaming',
    });
    expect(structuredClone(part)).toEqual({
      type: 'text',
      text: 'Hello world',
      state: 'streaming',
    });
  });

  it('supports assigning text while the lazy property is installed', () => {
    const part = prepareTextAccumulator({ type: 'text', text: 'initial' });

    appendToTextAccumulator({ part, textDelta: ' ignored' });
    part.text = 'replacement';
    appendToTextAccumulator({ part, textDelta: ' text' });

    expect(part.text).toBe('replacement text');
  });

  it('finalizes text as a plain writable property', () => {
    const part = prepareTextAccumulator({ type: 'reasoning', text: '' });

    appendToTextAccumulator({ part, textDelta: 'think' });
    appendToTextAccumulator({ part, textDelta: 'ing' });
    finalizeTextAccumulator(part);

    const descriptor = Object.getOwnPropertyDescriptor(part, 'text');

    expect(part.text).toBe('thinking');
    expect(descriptor).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'thinking',
    });

    part.text = 'done';

    expect(part.text).toBe('done');
  });

  it('falls back to string append for unprepared parts', () => {
    const part = { type: 'text', text: 'Hello' };

    appendToTextAccumulator({ part, textDelta: ' world' });
    finalizeTextAccumulator(part);

    expect(part.text).toBe('Hello world');
  });
});
