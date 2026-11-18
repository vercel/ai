import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createInferenceCoop } from './inference-coop-provider';
import { InferenceCoopSpeechModel } from './inference-coop-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createInferenceCoop({ apiKey: 'test-api-key' });
const model = provider.speech('tinfoil/voxtral-tts');
const url = 'https://gateway.inference.coop/v1/audio/speech';

const server = createTestServer({
  [url]: {},
});

function prepareAudioResponse({
  headers,
  contentType = 'audio/wav',
}: {
  headers?: Record<string, string>;
  contentType?: string;
} = {}) {
  const audio = new Uint8Array([1, 2, 3, 4]);
  server.urls[url].response = {
    type: 'binary',
    headers: {
      'content-type': contentType,
      ...headers,
    },
    body: Buffer.from(audio),
  };
  return audio;
}

describe('InferenceCoopSpeechModel', () => {
  it('should expose correct provider and model information', () => {
    expect(model.provider).toBe('inference-coop.speech');
    expect(model.modelId).toBe('tinfoil/voxtral-tts');
    expect(model.specificationVersion).toBe('v4');
  });
});

describe('doGenerate', () => {
  it('should send text, model, and voice', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'tinfoil/voxtral-tts',
      input: 'Hello from the cooperative!',
      voice: 'neutral_female',
    });
    expect(server.calls[0].requestMethod).toBe('POST');
    expect(server.calls[0].requestUrl).toBe(url);
  });

  it('should map outputFormat to response_format and pass speed', async () => {
    prepareAudioResponse({ contentType: 'audio/mpeg' });

    await model.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
      outputFormat: 'mp3',
      speed: 1.5,
    });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'tinfoil/voxtral-tts',
      input: 'Hello from the cooperative!',
      voice: 'neutral_female',
      response_format: 'mp3',
      speed: 1.5,
    });
  });

  it('should omit the voice instead of inventing a default', async () => {
    prepareAudioResponse();

    await model.doGenerate({ text: 'Hello from the cooperative!' });

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      model: 'tinfoil/voxtral-tts',
      input: 'Hello from the cooperative!',
    });
  });

  it('should warn when instructions are provided', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
      instructions: 'Speak cheerfully',
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'instructions',
      }),
    );
  });

  it('should warn when a language is provided', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
      language: 'en',
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'unsupported', feature: 'language' }),
    );
  });

  it('should pass headers and the co-op user agent', async () => {
    prepareAudioResponse();

    const customProvider = createInferenceCoop({
      apiKey: 'test-api-key',
      headers: { 'Custom-Provider-Header': 'provider-header-value' },
    });

    await customProvider.speech('tinfoil/voxtral-tts').doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
      headers: { 'Custom-Request-Header': 'request-header-value' },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
    expect(server.calls[0].requestUserAgent).toContain(
      'ai-sdk-inference-coop/0.0.0-test',
    );
  });

  it('should return binary audio data', async () => {
    const audio = prepareAudioResponse();

    const result = await model.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
    });

    expect(result.audio).toStrictEqual(audio);
    expect(result.warnings).toEqual([]);
  });

  it('should include response timestamp, model id, and headers', async () => {
    prepareAudioResponse({ headers: { 'x-request-id': 'test-request-id' } });
    const testDate = new Date(0);
    const customModel = new InferenceCoopSpeechModel('tinfoil/voxtral-tts', {
      provider: 'inference-coop.speech',
      baseURL: 'https://gateway.inference.coop/v1',
      headers: () => ({ Authorization: 'Bearer test-api-key' }),
      _internal: { currentDate: () => testDate },
    });

    const result = await customModel.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'tinfoil/voxtral-tts',
      headers: expect.objectContaining({ 'x-request-id': 'test-request-id' }),
    });
  });

  it('should handle the missing-voice error from the gateway', async () => {
    server.urls[url].response = {
      type: 'error',
      status: 400,
      // Verbatim capture from the gateway (2026-11), truncated to the
      // relevant part of the LiteLLM banner.
      body: JSON.stringify({
        error: {
          message:
            "litellm.BadRequestError: 'voice' is required to be passed as a string for OpenAI TTS",
          type: 'invalid_request_error',
        },
      }),
    };

    await expect(
      model.doGenerate({ text: 'Hello from the cooperative!' }),
    ).rejects.toMatchObject({
      message:
        "litellm.BadRequestError: 'voice' is required to be passed as a string for OpenAI TTS",
      statusCode: 400,
    });
  });
});
