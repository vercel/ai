import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { DataStreamPart } from '../../src/data-stream/data-stream-parts';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';
import { processDataStream } from './process-data-stream';

function createReadableStream(
  parts: DataStreamPart[],
): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(parts)
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream());
}

describe('processDataStream', () => {
  it('should process a simple text stream part', async () => {
    const stream = createReadableStream([{ type: 'text', value: 'Hello' }]);
    const receivedParts: DataStreamPart[] = [];

    await processDataStream({
      stream,
      onTextPart: async value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(1);
    expect(receivedParts[0]).toEqual({
      type: 'text',
      value: 'Hello',
    });
  });

  it('should handle multiple stream parts in sequence', async () => {
    const stream = createReadableStream([
      { type: 'text', value: 'Hello' },
      { type: 'reasoning', value: { text: 'reasoning' } },
      { type: 'error', value: 'error' },
    ]);
    const receivedParts: DataStreamPart[] = [];

    await processDataStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
      onReasoningPart: value => {
        receivedParts.push({ type: 'reasoning', value });
      },
      onErrorPart: value => {
        receivedParts.push({ type: 'error', value });
      },
    });

    expect(receivedParts).toHaveLength(3);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({
      type: 'reasoning',
      value: { text: 'reasoning' },
    });
    expect(receivedParts[2]).toEqual({ type: 'error', value: 'error' });
  });

  it('should handle multiple text parts', async () => {
    const stream = createReadableStream([
      { type: 'text', value: 'Hello' },
      { type: 'text', value: 'World' },
    ]);
    const receivedParts: DataStreamPart[] = [];

    await processDataStream({
      stream,
      onTextPart: value => {
        receivedParts.push({ type: 'text', value });
      },
    });

    expect(receivedParts).toHaveLength(2);
    expect(receivedParts[0]).toEqual({ type: 'text', value: 'Hello' });
    expect(receivedParts[1]).toEqual({ type: 'text', value: 'World' });
  });

  it('should throw on malformed JSON', async () => {
    await expect(
      processDataStream({
        stream: convertArrayToReadableStream(['data: {asd']).pipeThrough(
          new TextEncoderStream(),
        ),
      }),
    ).rejects.toThrow();
  });

  it('should throw on invalid stream part codes', async () => {
    await expect(
      processDataStream({
        stream: convertArrayToReadableStream([
          'data: {"type": "invalid" }',
        ]).pipeThrough(new TextEncoderStream()),
      }),
    ).rejects.toThrow('Failed to parse data stream part');
  });
});
