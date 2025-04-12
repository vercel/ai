import { createTestServer } from '@ai-sdk/provider-utils/test';
import { ElevenLabsVoiceChangerModel } from './elevenlabs-voice-changer-model';
import { createElevenLabs } from './elevenlabs-provider';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const audioData = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const provider = createElevenLabs({ apiKey: 'test-api-key' });
const model = provider.voiceChanger('eleven_multilingual_v2');

const server = createTestServer({
  'https://api.elevenlabs.io/v1/speech-to-speech': {},
});

describe('doGenerate', () => {
  function prepareAudioResponse({
    headers,
    format = 'mp3',
  }: {
    headers?: Record<string, string>;
    format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  } = {}) {
    const audioBuffer = new Uint8Array(100); // Mock audio data
    server.urls['https://api.elevenlabs.io/v1/speech-to-speech'].response = {
      type: 'binary',
      headers: {
        'content-type': `audio/${format}`,
        ...headers,
      },
      body: Buffer.from(audioBuffer),
    };
    return audioBuffer;
  }

  it('should pass the model', async () => {
    prepareAudioResponse();

    await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(await server.calls[0].requestBodyMultipart).toMatchObject({
      model_id: 'eleven_multilingual_v2',
    });
  });

  it('should pass headers', async () => {
    prepareAudioResponse();

    const provider = createElevenLabs({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.transcription('scribe_v1').doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      'xi-api-key': 'test-api-key',
      'content-type': expect.stringMatching(
        /^multipart\/form-data; boundary=----formdata-undici-\d+$/,
      ),
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
    });
  });

  it('should extract the transcription text', async () => {
    prepareAudioResponse();

    const result = await model.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.text).toBe('Hello world!');
  });

  it('should include response data with timestamp, modelId and headers', async () => {
    prepareAudioResponse({
      headers: {
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });

    const testDate = new Date(0);
    const customModel = new ElevenLabsVoiceChangerModel('eleven_multilingual_v2', {
      provider: 'test-provider',
      url: () => 'https://api.elevenlabs.io/v1/speech-to-speech',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.response).toMatchObject({
      timestamp: testDate,
      modelId: 'eleven_multilingual_v2',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-request-id',
        'x-ratelimit-remaining': '123',
      },
    });
  });

  it('should use real date when no custom date provider is specified', async () => {
    prepareAudioResponse();

    const testDate = new Date(0);
    const customModel = new ElevenLabsVoiceChangerModel('eleven_multilingual_v2', {
      provider: 'test-provider',
      url: () => 'https://api.elevenlabs.io/v1/speech-to-speech',
      headers: () => ({}),
      _internal: {
        currentDate: () => testDate,
      },
    });

    const result = await customModel.doGenerate({
      audio: audioData,
      mediaType: 'audio/wav',
    });

    expect(result.response.timestamp.getTime()).toEqual(testDate.getTime());
    expect(result.response.modelId).toBe('eleven_multilingual_v2');
  });

});
