import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { fromUtf8, toUtf8 } from '@smithy/util-utf8';
import { describe, expect, it, vi } from 'vitest';
import {
  AmazonBedrockPegasusLanguageModel,
  isAmazonBedrockPegasusModelId,
} from './amazon-bedrock-pegasus-language-model';

const modelId = 'us.twelvelabs.pegasus-1-2-v1:0';
const codec = new EventStreamCodec(toUtf8, fromUtf8);

describe('AmazonBedrockPegasusLanguageModel', () => {
  it('uses InvokeModel with Pegasus native video and structured-output fields', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: '{"summary":"A park"}',
          finishReason: 'stop',
        }),
        {
          headers: {
            date: 'Wed, 03 Sep 2026 17:00:00 GMT',
            'x-amzn-requestid': 'request-id',
          },
        },
      ),
    );
    const model = new AmazonBedrockPegasusLanguageModel(modelId, {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      fetch,
    });

    const result = await model.doGenerate({
      prompt: [
        { role: 'system', content: 'Return JSON.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize the video.' },
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'url', url: new URL('s3://videos/example.mp4') },
            },
          ],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: 200,
      responseFormat: {
        type: 'json',
        schema: { type: 'object', properties: { summary: { type: 'string' } } },
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://bedrock-runtime.us-east-1.amazonaws.com/model/us.twelvelabs.pegasus-1-2-v1%3A0/invoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          inputPrompt: 'Return JSON.\nSummarize the video.',
          mediaSource: { s3Location: { uri: 's3://videos/example.mp4' } },
          temperature: 0.2,
          maxOutputTokens: 200,
          responseFormat: {
            jsonSchema: {
              type: 'object',
              properties: { summary: { type: 'string' } },
            },
          },
        }),
      }),
    );
    expect(result).toMatchObject({
      content: [{ type: 'text', text: '{"summary":"A park"}' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      response: { id: 'request-id', modelId },
    });
  });

  it('converts inline video bytes to the Pegasus base64 source', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'A video', finishReason: 'length' }),
        ),
      );
    const model = new AmazonBedrockPegasusLanguageModel(modelId, {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      fetch,
    });

    await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe it.' },
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'data', data: new Uint8Array([0, 1, 2]) },
            },
          ],
        },
      ],
    });

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      mediaSource: { base64String: 'AAEC' },
    });
  });

  it('requires exactly one S3 or inline video', async () => {
    const model = new AmazonBedrockPegasusLanguageModel(modelId, {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
    });

    await expect(
      model.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      }),
    ).rejects.toSatisfy(UnsupportedFunctionalityError.isInstance);
  });

  it('decodes native Bedrock event-stream frames for Pegasus', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        createStream([
          createEvent({ message: 'The video', stopReason: '' }),
          createEvent({
            message: '',
            stopReason: 'stop',
            'amazon-bedrock-invocationMetrics': {
              inputTokenCount: 0,
              outputTokenCount: 2,
              invocationLatency: 12,
              firstByteLatency: 3,
            },
          }),
        ]),
        {
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
            'x-amzn-requestid': 'request-id',
          },
        },
      ),
    );
    const model = new AmazonBedrockPegasusLanguageModel(modelId, {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      fetch,
    });

    const { stream } = await model.doStream({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe it.' },
            {
              type: 'file',
              mediaType: 'video/mp4',
              data: { type: 'url', url: new URL('s3://videos/example.mp4') },
            },
          ],
        },
      ],
      includeRawChunks: true,
    });

    expect(await convertReadableStreamToArray(stream)).toMatchObject([
      { type: 'stream-start' },
      { type: 'response-metadata', id: 'request-id', modelId },
      { type: 'raw' },
      { type: 'text-start', id: '0' },
      { type: 'text-delta', id: '0', delta: 'The video' },
      { type: 'raw' },
      { type: 'text-end', id: '0' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 0 },
          outputTokens: { total: 2, text: 2 },
        },
      },
    ]);
  });
});

function createEvent(payload: Record<string, unknown>): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: 'chunk' },
    },
    body: fromUtf8(
      JSON.stringify({
        bytes: convertUint8ArrayToBase64(fromUtf8(JSON.stringify(payload))),
      }),
    ),
  });
}

function createStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('isAmazonBedrockPegasusModelId', () => {
  it.each([
    'twelvelabs.pegasus-1-2-v1:0',
    'us.twelvelabs.pegasus-1-2-v1:0',
    'eu.twelvelabs.pegasus-1-2-v1:0',
    'global.twelvelabs.pegasus-1-2-v1:0',
  ])('detects %s', modelId => {
    expect(isAmazonBedrockPegasusModelId(modelId)).toBe(true);
  });

  it('does not route TwelveLabs Marengo to the Pegasus adapter', () => {
    expect(
      isAmazonBedrockPegasusModelId('twelvelabs.marengo-embed-3-0-v1:0'),
    ).toBe(false);
  });
});
