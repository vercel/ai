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

    expect(await convertReadableStreamToArray(parseEncodedDataStream(stream)))
      .toMatchInlineSnapshot(`
      [
        {
          "rawValue": {
            "type": "text",
            "value": "Hello",
          },
          "success": true,
          "value": {
            "type": "text",
            "value": "Hello",
          },
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

    expect(await convertReadableStreamToArray(parseEncodedDataStream(stream)))
      .toMatchInlineSnapshot(`
        [
          {
            "rawValue": {
              "type": "text",
              "value": "Hello",
            },
            "success": true,
            "value": {
              "type": "text",
              "value": "Hello",
            },
          },
          {
            "rawValue": {
              "type": "reasoning",
              "value": {
                "text": "reasoning",
              },
            },
            "success": true,
            "value": {
              "type": "reasoning",
              "value": {
                "text": "reasoning",
              },
            },
          },
          {
            "rawValue": {
              "type": "error",
              "value": "error",
            },
            "success": true,
            "value": {
              "type": "error",
              "value": "error",
            },
          },
        ]
      `);
  });

  it('should handle multiple text parts', async () => {
    const stream = createReadableStream([
      { type: 'text', value: 'Hello' },
      { type: 'text', value: 'World' },
    ]);

    expect(await convertReadableStreamToArray(parseEncodedDataStream(stream)))
      .toMatchInlineSnapshot(`
        [
          {
            "rawValue": {
              "type": "text",
              "value": "Hello",
            },
            "success": true,
            "value": {
              "type": "text",
              "value": "Hello",
            },
          },
          {
            "rawValue": {
              "type": "text",
              "value": "World",
            },
            "success": true,
            "value": {
              "type": "text",
              "value": "World",
            },
          },
        ]
      `);
  });

  it('should fail validation on malformed JSON', async () => {
    const stream = convertArrayToReadableStream(['data: {asd']).pipeThrough(
      new TextEncoderStream(),
    );

    expect(await convertReadableStreamToArray(parseEncodedDataStream(stream)))
      .toMatchInlineSnapshot(`
        [
          {
            "error": [AI_JSONParseError: JSON parsing failed: Text: {asd.
        Error message: Expected property name or '}' in JSON at position 1 (line 1 column 2)],
            "rawValue": undefined,
            "success": false,
          },
        ]
      `);
  });

  it('should throw on invalid stream part codes', async () => {
    const stream = convertArrayToReadableStream([
      'data: {"type": "invalid" }',
    ]).pipeThrough(new TextEncoderStream());

    expect(await convertReadableStreamToArray(parseEncodedDataStream(stream)))
      .toMatchInlineSnapshot(`
        [
          {
            "error": [AI_TypeValidationError: Type validation failed: Value: {"type":"invalid"}.
        Error message: [
          {
            "code": "invalid_union_discriminator",
            "options": [
              "text",
              "error",
              "tool-call",
              "tool-result",
              "tool-call-streaming-start",
              "tool-call-delta",
              "reasoning",
              "source",
              "file",
              "message-metadata",
              "start-step",
              "finish-step",
              "start",
              "finish",
              "reasoning-part-finish"
            ],
            "path": [
              "type"
            ],
            "message": "Invalid discriminator value. Expected 'text' | 'error' | 'tool-call' | 'tool-result' | 'tool-call-streaming-start' | 'tool-call-delta' | 'reasoning' | 'source' | 'file' | 'message-metadata' | 'start-step' | 'finish-step' | 'start' | 'finish' | 'reasoning-part-finish'"
          }
        ]],
            "rawValue": {
              "type": "invalid",
            },
            "success": false,
          },
        ]
      `);
  });
});
