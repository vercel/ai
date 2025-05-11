import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { DataStreamPart } from '../../src/data-stream/data-stream-parts';
import { JsonToSseTransformStream } from './json-to-sse-transform-stream';
import { parseEncodedDataStream } from './parse-encoded-data-stream';

function createReadableStream(
  parts: DataStreamPart[],
): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(parts)
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream());
}

describe('parseEncodedDataStream', () => {
  it('should process a simple text stream part', async () => {
    const stream = createReadableStream([{ type: 'text', value: 'Hello' }]);

    expect(
      await convertReadableStreamToArray(
        parseEncodedDataStream({
          stream,
          onError: error => {
            throw error;
          },
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "Hello",
        },
      ]
    `);
  });

  it('should handle multiple stream parts in sequence', async () => {
    const stream = createReadableStream([
      { type: 'text', value: 'Hello' },
      { type: 'reasoning', value: { text: 'reasoning' } },
      { type: 'error', value: 'error' },
    ]);

    expect(
      await convertReadableStreamToArray(
        parseEncodedDataStream({
          stream,
          onError: error => {
            throw error;
          },
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "Hello",
        },
        {
          "type": "reasoning",
          "value": {
            "text": "reasoning",
          },
        },
        {
          "type": "error",
          "value": "error",
        },
      ]
    `);
  });

  it('should handle multiple text parts', async () => {
    const stream = createReadableStream([
      { type: 'text', value: 'Hello' },
      { type: 'text', value: 'World' },
    ]);

    expect(
      await convertReadableStreamToArray(
        parseEncodedDataStream({
          stream,
          onError: error => {
            throw error;
          },
        }),
      ),
    ).toMatchInlineSnapshot(`
      [
        {
          "type": "text",
          "value": "Hello",
        },
        {
          "type": "text",
          "value": "World",
        },
      ]
    `);
  });

  it('should fail validation on malformed JSON', async () => {
    const stream = convertArrayToReadableStream(['data: {asd']).pipeThrough(
      new TextEncoderStream(),
    );

    await expect(() =>
      convertReadableStreamToArray(
        parseEncodedDataStream({
          stream,
          onError: error => {
            throw error;
          },
        }),
      ),
    ).rejects.toThrow('JSON parsing failed: Text: {asd');
  });

  it('should throw on invalid stream part codes', async () => {
    const stream = convertArrayToReadableStream([
      'data: {"type": "invalid" }',
    ]).pipeThrough(new TextEncoderStream());

    await expect(() =>
      convertReadableStreamToArray(
        parseEncodedDataStream({
          stream,
          onError: error => {
            throw error;
          },
        }),
      ),
    ).rejects.toThrow('Type validation failed: Value: {"type":"invalid"}.');
  });
});
