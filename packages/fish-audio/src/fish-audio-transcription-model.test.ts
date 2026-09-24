import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createFishAudio } from './fish-audio-provider';
import { FishAudioTranscriptionModel } from './fish-audio-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const url = 'https://api.fish.audio/v1/asr';
const audioData = new Uint8Array([0, 1, 2, 3, 4]);
const provider = createFishAudio({ apiKey: 'test-api-key' });
const model = provider.transcription();

const transcriptionResponse = {
  language: 'English',
  language_code: 'en',
  text: 'Hello, world!',
  duration: 2.5,
  segments: [
    { text: 'Hello,', start: 0, end: 1.2 },
    { text: 'world!', start: 1.2, end: 2.5 },
  ],
};

const server = createTestServer({
  [url]: {},
});

function prepareJsonResponse({
  body = transcriptionResponse,
  headers,
}: {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
} = {}) {
  server.urls[url].response = {
    type: 'json-value',
    headers,
    body,
  };
}

describe('FishAudioTranscriptionModel', () => {
  it('should send Uint8Array audio as a multipart file named `audio`', async () => {
    prepareJsonResponse();

    await model.doGenerate({ audio: audioData, mediaType: 'audio/mpeg' });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(url);
    expect(multipart?.audio).toBeInstanceOf(File);
    expect(multipart?.audio.type).toBe('audio/mpeg');
  });

  it('should accept base64 audio', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: Buffer.from(audioData).toString('base64'),
      mediaType: 'audio/mpeg',
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.audio).toBeInstanceOf(File);
    expect(await multipart?.audio.arrayBuffer()).toStrictEqual(
      audioData.buffer,
    );
  });

  it('should pass the api key as a bearer token', async () => {
    prepareJsonResponse();

    await model.doGenerate({ audio: audioData, mediaType: 'audio/mpeg' });

    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer test-api-key',
    );
  });

  it('should request timestamps by default', async () => {
    prepareJsonResponse();

    await model.doGenerate({ audio: audioData, mediaType: 'audio/mpeg' });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.ignore_timestamps).toBe('false');
  });

  it('should allow opting out of timestamps', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
      providerOptions: { fishAudio: { ignoreTimestamps: true } },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.ignore_timestamps).toBe('true');
  });

  it('should send the language when provided', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
      providerOptions: { fishAudio: { language: 'en' } },
    });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart?.language).toBe('en');
  });

  it('should omit the language when not provided', async () => {
    prepareJsonResponse();

    await model.doGenerate({ audio: audioData, mediaType: 'audio/mpeg' });

    const multipart = await server.calls[0].requestBodyMultipart;
    expect(multipart).not.toHaveProperty('language');
  });

  it('should map the transcript, segments and duration', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.text).toBe('Hello, world!');
    expect(result.durationInSeconds).toBe(2.5);
    expect(result.segments).toStrictEqual([
      { text: 'Hello,', startSecond: 0, endSecond: 1.2 },
      { text: 'world!', startSecond: 1.2, endSecond: 2.5 },
    ]);
    expect(result.warnings).toStrictEqual([]);
  });

  it('should report the detected language code', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.language).toBe('en');
  });

  it('should prefer the detected language over the requested one', async () => {
    // Fish Audio ignores the requested language when detecting: asking for `ja`
    // on English audio still reports English.
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
      providerOptions: { fishAudio: { language: 'ja' } },
    });

    expect(result.language).toBe('en');
  });

  it('should expose the human-readable language as provider metadata', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.providerMetadata).toStrictEqual({
      fishAudio: { language: 'English' },
    });
  });

  it('should report an undefined language when the response omits it', async () => {
    prepareJsonResponse({ body: { text: 'Hello, world!', duration: 1 } });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.language).toBeUndefined();
    expect(result.providerMetadata).toBeUndefined();
  });

  it('should fall back to empty segments when the response omits them', async () => {
    prepareJsonResponse({ body: { text: 'Hello, world!', duration: 1 } });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.segments).toStrictEqual([]);
    expect(result.durationInSeconds).toBe(1);
  });

  it('should tolerate a missing duration', async () => {
    prepareJsonResponse({ body: { text: 'Hello, world!', segments: [] } });

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.durationInSeconds).toBeUndefined();
  });

  it('should return response metadata', async () => {
    prepareJsonResponse({ headers: { 'x-request-id': 'test-request-id' } });
    const testDate = new Date(2024, 0, 1);

    const customModel = new FishAudioTranscriptionModel('transcribe-1', {
      provider: 'fish-audio.transcription',
      url: ({ path }) => `https://api.fish.audio${path}`,
      headers: () => ({ Authorization: 'Bearer test-api-key' }),
      _internal: { currentDate: () => testDate },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/mpeg',
    });

    expect(result.response.timestamp).toStrictEqual(testDate);
    expect(result.response.modelId).toBe('transcribe-1');
    expect(result.response.headers).toMatchObject({
      'x-request-id': 'test-request-id',
    });
  });

  it('should include a user agent suffix', async () => {
    prepareJsonResponse();

    await model.doGenerate({ audio: audioData, mediaType: 'audio/mpeg' });

    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk/fish-audio/0.0.0-test',
    );
  });

  it('should surface API errors', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 401,
      body: JSON.stringify({
        status: 401,
        message: 'No permission -- see authorization schemes',
      }),
    };

    await expect(
      model.doGenerate({ audio: audioData, mediaType: 'audio/mpeg' }),
    ).rejects.toThrow('No permission -- see authorization schemes');
  });
});
