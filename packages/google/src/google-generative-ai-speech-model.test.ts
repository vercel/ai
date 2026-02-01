import { describe, expect, it, vi } from 'vitest';
import { GoogleGenerativeAISpeechModel } from './google-generative-ai-speech-model';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const text = 'Hello from the AI SDK!';

// Valid base64 for "Hello World" audio mock
const DEFAULT_AUDIO_DATA = 'SGVsbG8gV29ybGQ=';

function createMockModel({
  modelId = 'gemini-2.5-flash-preview-tts',
  currentDate,
  audioData = DEFAULT_AUDIO_DATA,
  mimeType = 'audio/L16;rate=24000',
  onRequest,
  apiKey = 'test-api-key',
}: {
  modelId?: string;
  currentDate?: () => Date;
  audioData?: string;
  mimeType?: string;
  onRequest?: (
    url: string,
    body: unknown,
    headers: Record<string, string>,
  ) => void;
  apiKey?: string;
} = {}) {
  return new GoogleGenerativeAISpeechModel(modelId, {
    provider: 'google.generative-ai',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({ 'x-goog-api-key': apiKey }),
    fetch: async (url, init) => {
      const urlString = url.toString();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const headers = (init?.headers as Record<string, string>) ?? {};

      onRequest?.(urlString, body, headers);

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioData,
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': 'test-request-id',
          },
        },
      );
    },
    _internal: {
      currentDate,
    },
  });
}

describe('GoogleGenerativeAISpeechModel', () => {
  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createMockModel();

      expect(model.provider).toBe('google.generative-ai');
      expect(model.modelId).toBe('gemini-2.5-flash-preview-tts');
      expect(model.specificationVersion).toBe('v3');
    });

    it('should support different model IDs', () => {
      const model = createMockModel({ modelId: 'gemini-2.5-pro-preview-tts' });

      expect(model.modelId).toBe('gemini-2.5-pro-preview-tts');
    });
  });

  describe('doGenerate', () => {
    it('should pass the model ID and text correctly', async () => {
      let capturedUrl: string | undefined;
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (url, body) => {
          capturedUrl = url;
          capturedBody = body;
        },
      });

      await model.doGenerate({ text });

      expect(capturedUrl).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
      );
      expect(capturedBody).toMatchObject({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
        },
      });
    });

    it('should pass headers correctly', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      const model = createMockModel({
        apiKey: 'test-api-key',
        onRequest: (_url, _body, headers) => {
          capturedHeaders = headers;
        },
      });

      await model.doGenerate({
        text,
        headers: { 'Custom-Header': 'custom-value' },
      });

      expect(capturedHeaders).toMatchObject({
        'x-goog-api-key': 'test-api-key',
        'custom-header': 'custom-value',
      });
    });

    it('should pass voice configuration', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (_url, body) => {
          capturedBody = body;
        },
      });

      await model.doGenerate({
        text,
        voice: 'Kore',
      });

      expect(capturedBody).toMatchObject({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore',
              },
            },
          },
        },
      });
    });

    it('should pass language code', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (_url, body) => {
          capturedBody = body;
        },
      });

      await model.doGenerate({
        text,
        language: 'en-US',
      });

      expect(capturedBody).toMatchObject({
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            languageCode: 'en-US',
          },
        },
      });
    });

    it('should prepend instructions to text', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (_url, body) => {
          capturedBody = body;
        },
      });

      await model.doGenerate({
        text,
        instructions: 'Speak in a slow and calm tone.',
      });

      expect(capturedBody).toMatchObject({
        contents: [
          {
            parts: [{ text: `Speak in a slow and calm tone.\n\n${text}` }],
          },
        ],
      });
    });

    it('should handle replicated voice config for voice cloning', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (_url, body) => {
          capturedBody = body;
        },
      });

      await model.doGenerate({
        text,
        providerOptions: {
          google: {
            replicatedVoiceConfig: {
              mimeType: 'audio/wav',
              voiceSampleAudio: 'base64-voice-sample',
            },
          },
        },
      });

      expect(capturedBody).toMatchObject({
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              replicatedVoiceConfig: {
                mimeType: 'audio/wav',
                voiceSampleAudio: 'base64-voice-sample',
              },
            },
          },
        },
      });
    });

    it('should handle multi-speaker configuration', async () => {
      let capturedBody: unknown;
      const model = createMockModel({
        onRequest: (_url, body) => {
          capturedBody = body;
        },
      });

      await model.doGenerate({
        text: '[Alice] Hello! [Bob] Hi there!',
        providerOptions: {
          google: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Alice',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                  },
                },
                {
                  speaker: 'Bob',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                  },
                },
              ],
            },
          },
        },
      });

      expect(capturedBody).toMatchObject({
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Alice',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                  },
                },
                {
                  speaker: 'Bob',
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Puck' },
                  },
                },
              ],
            },
          },
        },
      });
    });

    it('should return audio data as WAV format Uint8Array', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({ text });

      expect(result.audio).toBeInstanceOf(Uint8Array);
      // WAV header is 44 bytes + PCM data (11 bytes for "Hello World")
      expect(result.audio.length).toBe(44 + 11);
      // Check WAV header magic bytes
      expect(String.fromCharCode(...result.audio.slice(0, 4))).toBe('RIFF');
      expect(String.fromCharCode(...result.audio.slice(8, 12))).toBe('WAVE');
    });

    it('should include response metadata with timestamp, modelId, and headers', async () => {
      const testDate = new Date('2024-01-01T00:00:00Z');
      const model = createMockModel({
        currentDate: () => testDate,
      });

      const result = await model.doGenerate({ text });

      expect(result.response.timestamp).toStrictEqual(testDate);
      expect(result.response.modelId).toBe('gemini-2.5-flash-preview-tts');
      expect(result.response.headers).toBeDefined();
    });

    it('should include request body in response', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({ text });

      expect(result.request?.body).toMatchObject({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
        },
      });
    });
  });

  describe('warnings', () => {
    it('should generate warning for speed parameter', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({
        text,
        speed: 1.5,
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'speed',
        details: 'Gemini TTS does not support speed control.',
      });
    });

    it('should generate warning for outputFormat parameter when not wav', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({
        text,
        outputFormat: 'mp3',
      });

      expect(result.warnings).toContainEqual({
        type: 'unsupported',
        feature: 'outputFormat',
        details:
          'Gemini TTS returns WAV audio. The outputFormat parameter is ignored.',
      });
    });

    it('should not generate warning when outputFormat is wav', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({
        text,
        outputFormat: 'wav',
      });

      expect(result.warnings).toStrictEqual([]);
    });

    it('should return empty warnings array when no unsupported features used', async () => {
      const model = createMockModel();

      const result = await model.doGenerate({ text });

      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw error when no audio data in response', async () => {
      const model = new GoogleGenerativeAISpeechModel(
        'gemini-2.5-flash-preview-tts',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                candidates: [
                  {
                    content: {
                      parts: [],
                    },
                  },
                ],
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await expect(model.doGenerate({ text })).rejects.toThrow(
        /No audio data in response/,
      );
    });

    it('should throw error when candidates are empty', async () => {
      const model = new GoogleGenerativeAISpeechModel(
        'gemini-2.5-flash-preview-tts',
        {
          provider: 'google.generative-ai',
          baseURL: 'https://generativelanguage.googleapis.com/v1beta',
          headers: () => ({ 'x-goog-api-key': 'test-key' }),
          fetch: async () => {
            return new Response(
              JSON.stringify({
                candidates: [],
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          },
        },
      );

      await expect(model.doGenerate({ text })).rejects.toThrow(
        /No audio data in response/,
      );
    });
  });
});
