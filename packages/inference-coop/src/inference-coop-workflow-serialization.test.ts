import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { InferenceCoopChatLanguageModel } from './inference-coop-chat-language-model';
import { InferenceCoopImageModel } from './inference-coop-image-model';
import { InferenceCoopSpeechModel } from './inference-coop-speech-model';
import { InferenceCoopTranscriptionModel } from './inference-coop-transcription-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const baseURL = 'https://gateway.inference.coop/v1';

const server = createTestServer({
  [`${baseURL}/chat/completions`]: {},
  [`${baseURL}/images/generations`]: {},
  [`${baseURL}/audio/speech`]: {},
  [`${baseURL}/audio/transcriptions`]: {},
});

// `serializeModelOptions` drops function-valued config (`url`, `fetch`) and
// resolves sync `headers`, so the deserialized model must rebuild its request
// URL from the serializable `baseURL`. These round trips verify a model that
// crosses a workflow step boundary can still make requests.

function roundTrip<MODEL, RESULT>(
  modelClass: {
    [WORKFLOW_SERIALIZE]: (model: MODEL) => unknown;
    [WORKFLOW_DESERIALIZE]: (options: never) => RESULT;
  },
  model: MODEL,
): RESULT {
  return modelClass[WORKFLOW_DESERIALIZE](
    modelClass[WORKFLOW_SERIALIZE](model) as never,
  );
}

describe('workflow serialization round trips', () => {
  it('restores the chat model endpoint', async () => {
    server.urls[`${baseURL}/chat/completions`].response = {
      type: 'json-value',
      body: {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1793582428,
        model: 'greenpt/glm-5.3',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'Hello!' },
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      },
    };

    const deserialized = roundTrip(
      InferenceCoopChatLanguageModel,
      new InferenceCoopChatLanguageModel('greenpt/glm-5.3', {
        provider: 'inference-coop.chat',
        baseURL,
        headers: () => ({ Authorization: 'Bearer test-api-key' }),
      }),
    );

    const result = await deserialized.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://gateway.inference.coop/v1/chat/completions',
    );
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
    });
    expect(result.content).toHaveLength(1);
  });

  it('restores the image model endpoint', async () => {
    server.urls[`${baseURL}/images/generations`].response = {
      type: 'json-value',
      body: {
        created: 1793582476,
        data: [{ b64_json: 'AQIDBA==', url: null }],
        usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      },
    };

    const deserialized = roundTrip(
      InferenceCoopImageModel,
      new InferenceCoopImageModel('regolo/qwen-image', {
        provider: 'inference-coop.image',
        baseURL,
        headers: () => ({ Authorization: 'Bearer test-api-key' }),
      }),
    );

    const result = await deserialized.doGenerate({
      prompt: 'a red circle',
      n: 1,
      size: undefined,
      aspectRatio: undefined,
      seed: undefined,
      files: undefined,
      mask: undefined,
      providerOptions: {},
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://gateway.inference.coop/v1/images/generations',
    );
    expect(result.images).toStrictEqual(['AQIDBA==']);
  });

  it('restores the speech model endpoint', async () => {
    const audio = new Uint8Array([1, 2, 3, 4]);
    server.urls[`${baseURL}/audio/speech`].response = {
      type: 'binary',
      headers: { 'content-type': 'audio/wav' },
      body: Buffer.from(audio),
    };

    const deserialized = roundTrip(
      InferenceCoopSpeechModel,
      new InferenceCoopSpeechModel('tinfoil/voxtral-tts', {
        provider: 'inference-coop.speech',
        baseURL,
        headers: () => ({ Authorization: 'Bearer test-api-key' }),
      }),
    );

    const result = await deserialized.doGenerate({
      text: 'Hello from the cooperative!',
      voice: 'neutral_female',
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://gateway.inference.coop/v1/audio/speech',
    );
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
    });
    expect(result.audio).toStrictEqual(audio);
  });

  it('restores the transcription model endpoint', async () => {
    server.urls[`${baseURL}/audio/transcriptions`].response = {
      type: 'json-value',
      body: {
        text: ' Hello from the cooperative.',
        usage: null,
        language: 'en',
        duration: '1.4666875',
        words: null,
        segments: [
          { start: 0, end: 1.16, text: ' Hello from the cooperative.' },
        ],
      },
    };

    const deserialized = roundTrip(
      InferenceCoopTranscriptionModel,
      new InferenceCoopTranscriptionModel('tinfoil/whisper-large-v3-turbo', {
        provider: 'inference-coop.transcription',
        baseURL,
        headers: () => ({ Authorization: 'Bearer test-api-key' }),
      }),
    );

    const audioData = await readFile(
      path.join(__dirname, 'transcript-test.wav'),
    );
    const result = await deserialized.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(server.calls[0].requestUrl).toBe(
      'https://gateway.inference.coop/v1/audio/transcriptions',
    );
    expect(result.text).toBe(' Hello from the cooperative.');
  });
});
