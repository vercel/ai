import { APICallError, UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { GoogleSpeechModel } from './google-speech-model';

vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

const modelId = 'gemini-3.1-flash-tts-preview';
const baseURL = 'https://generativelanguage.googleapis.com/v1beta';
const url = `${baseURL}/models/${modelId}:streamGenerateContent`;
const date = new Date('2026-09-21T00:00:00Z');
const model = new GoogleSpeechModel(modelId, {
  provider: 'google.generative-ai',
  baseURL,
  headers: { 'x-goog-api-key': 'test-key' },
  _internal: { currentDate: () => date },
});
const server = createTestServer({ [url]: {} });
const audioPart = (data: string, mimeType = 'audio/L16;rate=24000') => ({
  inlineData: { data, mimeType },
});

function prepareResponse(chunks: unknown[]) {
  server.urls[url].response = {
    type: 'stream-chunks',
    headers: { 'x-test': 'value' },
    chunks: chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
  };
}

describe('doStream', () => {
  it('sends an SSE request with voice, instructions, headers, and response metadata', async () => {
    prepareResponse([]);
    const result = await model.doStream({
      text: 'Hello!',
      instructions: 'Say cheerfully',
      voice: 'Puck',
      headers: { 'custom-header': 'custom-value' },
    });
    expect(server.calls[0].requestUrl).toBe(`${url}?alt=sse`);
    expect(server.calls[0].requestHeaders).toMatchObject({
      'x-goog-api-key': 'test-key',
      'custom-header': 'custom-value',
    });
    expect(await server.calls[0].requestBodyJson).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'Say cheerfully: Hello!' }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
      },
    });
    expect(result.response).toMatchObject({
      timestamp: date,
      modelId,
      headers: { 'x-test': 'value' },
    });
    expect(result.warnings).toEqual([]);
    await convertReadableStreamToArray(result.stream);
  });

  it('streams every audio part in order, skips metadata, and ignores alternative candidates', async () => {
    prepareResponse([
      {
        candidates: [
          { content: { parts: [audioPart('AQI='), audioPart('AwQ=')] } },
          { content: { parts: [audioPart('CQo=')] } },
        ],
      },
      { usageMetadata: { totalTokenCount: 1 } },
      {
        candidates: [
          {
            content: {
              parts: [
                { text: 'ignored' },
                audioPart('BQY=', 'audio/L16;rate=16000'),
              ],
            },
          },
        ],
      },
    ]);
    const result = await model.doStream({ text: 'Hello' });
    const chunks = await convertReadableStreamToArray(result.stream);
    expect(chunks.map(chunk => chunk.audio)).toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5, 6]),
    ]);
    expect(chunks[0]).toEqual({
      type: 'audio',
      audio: new Uint8Array([1, 2]),
      mediaType: 'audio/pcm',
      providerMetadata: {
        google: { sampleRate: 24000, mimeType: 'audio/L16;rate=24000' },
      },
    });
    expect(chunks[2].providerMetadata?.google.sampleRate).toBe(16000);
  });

  it('preserves multi-speaker configuration', async () => {
    prepareResponse([]);
    const multiSpeakerVoiceConfig = {
      speakerVoiceConfigs: [
        {
          speaker: 'Joe',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        {
          speaker: 'Jane',
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
      ],
    };
    const result = await model.doStream({
      text: 'Joe: Hi. Jane: Hello.',
      providerOptions: { google: { multiSpeakerVoiceConfig } },
    });
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      generationConfig: { speechConfig: { multiSpeakerVoiceConfig } },
    });
    await convertReadableStreamToArray(result.stream);
  });

  it('warns when a container format is requested and returns raw PCM', async () => {
    prepareResponse([
      { candidates: [{ content: { parts: [audioPart('AQI=')] } }] },
    ]);
    const result = await model.doStream({ text: 'Hello', outputFormat: 'wav' });
    expect(result.warnings).toEqual([
      expect.objectContaining({ type: 'unsupported', feature: 'outputFormat' }),
    ]);
    expect(
      (await convertReadableStreamToArray(result.stream))[0].audio,
    ).toEqual(new Uint8Array([1, 2]));
  });

  it.each(['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'])(
    'rejects streaming for %s',
    async modelId => {
      const oldModel = new GoogleSpeechModel(modelId, {
        provider: 'google',
        baseURL,
      });
      await expect(oldModel.doStream({ text: 'Hello' })).rejects.toBeInstanceOf(
        UnsupportedFunctionalityError,
      );
      expect(server.calls).toHaveLength(0);
    },
  );

  it('propagates malformed SSE data', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: ['data: {invalid}\n\n'],
    };
    const result = await model.doStream({ text: 'Hello' });
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow();
  });

  it('propagates errors delivered in a successful SSE response', async () => {
    prepareResponse([{ error: { code: 500, message: 'Synthesis failed' } }]);
    const result = await model.doStream({ text: 'Hello' });
    await expect(
      convertReadableStreamToArray(result.stream),
    ).rejects.toMatchObject({
      message: 'Synthesis failed',
      isRetryable: false,
    });
  });

  it('propagates HTTP errors', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 500,
      body: JSON.stringify({
        error: { code: 500, message: 'Failed', status: 'INTERNAL' },
      }),
    };
    await expect(model.doStream({ text: 'Hello' })).rejects.toBeInstanceOf(
      APICallError,
    );
  });

  it('delivers audio before the response finishes and cancels the response on early exit', async () => {
    const cancel = vi.fn();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const abortSignal = new AbortController().signal;
    const fetch = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              source = controller;
            },
            cancel,
          }),
        ),
    );
    const model = new GoogleSpeechModel(modelId, {
      provider: 'google',
      baseURL,
      fetch,
    });
    const result = await model.doStream({ text: 'Hello', abortSignal });
    expect(fetch).toHaveBeenCalledWith(
      `${url}?alt=sse`,
      expect.objectContaining({ signal: abortSignal }),
    );
    source.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [audioPart('AQI=')] } }] })}\n\n`,
      ),
    );
    const reader = result.stream.getReader();
    expect((await reader.read()).value?.audio).toEqual(new Uint8Array([1, 2]));
    await reader.cancel('done');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});
