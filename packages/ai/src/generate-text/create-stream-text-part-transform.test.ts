import {
  LanguageModelV4Usage,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createStreamTextPartTransform } from './create-stream-text-part-transform';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

describe('createStreamTextPartTransform', () => {
  it('should convert text parts text to delta', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'text' },
        { type: 'text-end', id: '1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform(),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "text-start",
        },
        {
          "id": "1",
          "providerMetadata": undefined,
          "text": "text",
          "type": "text-delta",
        },
        {
          "id": "1",
          "type": "text-end",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });

  it('should convert reasoning parts text to delta', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        { type: 'reasoning-start', id: '1' },
        { type: 'reasoning-delta', id: '1', delta: 'text' },
        { type: 'reasoning-end', id: '1' },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform(),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "type": "reasoning-start",
        },
        {
          "id": "1",
          "providerMetadata": undefined,
          "text": "text",
          "type": "reasoning-delta",
        },
        {
          "id": "1",
          "type": "reasoning-end",
        },
      ]
    `);
  });

  it('should forward file parts', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'file',
          data: 'SGVsbG8gV29ybGQ=', // "Hello World" base64-encoded
          mediaType: 'text/plain',
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform(),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "file": DefaultGeneratedFileWithType {
            "base64Data": "SGVsbG8gV29ybGQ=",
            "mediaType": "text/plain",
            "type": "file",
            "uint8ArrayData": undefined,
          },
          "providerMetadata": undefined,
          "type": "file",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });

  it('should forward file parts with providerMetadata', async () => {
    const inputStream: ReadableStream<LanguageModelV4StreamPart> =
      convertArrayToReadableStream([
        {
          type: 'file',
          data: new Uint8Array([
            72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100,
          ]), // "Hello World" as Uint8Array
          mediaType: 'text/plain',
          providerMetadata: {
            testProvider: { signature: 'test-signature' },
          },
        },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: testUsage,
        },
      ]);

    const transformedStream = inputStream.pipeThrough(
      createStreamTextPartTransform(),
    );

    const result = await convertReadableStreamToArray(transformedStream);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "file": DefaultGeneratedFileWithType {
            "base64Data": undefined,
            "mediaType": "text/plain",
            "type": "file",
            "uint8ArrayData": Uint8Array [
              72,
              101,
              108,
              108,
              111,
              32,
              87,
              111,
              114,
              108,
              100,
            ],
          },
          "providerMetadata": {
            "testProvider": {
              "signature": "test-signature",
            },
          },
          "type": "file",
        },
        {
          "finishReason": {
            "raw": "stop",
            "unified": "stop",
          },
          "type": "finish",
          "usage": {
            "inputTokens": {
              "cacheRead": undefined,
              "cacheWrite": undefined,
              "noCache": 3,
              "total": 3,
            },
            "outputTokens": {
              "reasoning": undefined,
              "text": 10,
              "total": 10,
            },
          },
        },
      ]
    `);
  });
});
