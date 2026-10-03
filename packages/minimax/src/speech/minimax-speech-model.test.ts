import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, it, expect, vi } from 'vitest';
import { MinimaxSpeechModel } from './minimax-speech-model';
import type { MinimaxSpeechModelId } from './minimax-speech-model-options';
import type { FetchFunction } from '@ai-sdk/provider-utils';

vi.mock('../../version', () => ({
  VERSION: '0.0.0-test',
}));

const TEST_BASE_URL = 'https://api.example.com';
const SPEECH_URL = `${TEST_BASE_URL}/v1/t2a_v2`;

const mockAudioHex = '4d414e49414353000000000000000000';

const mockSpeechResponse = {
  data: {
    audio: mockAudioHex,
    status: 2,
    subtitle_file: undefined,
  },
  trace_id: 'trace-123',
  extra_info: {
    audio_length: 5.0,
    audio_sample_rate: 24000,
    audio_size: 120000,
    bitrate: 128000,
    audio_format: 'mp3',
    audio_channel: 1,
    invisible_character_ratio: 0,
    usage_characters: 50,
    usage_voice_count: 1,
    word_count: 10,
  },
  base_resp: {
    status_code: 0,
    status_msg: 'Success',
  },
};

const mockSpeechResponseWithURL = {
  data: {
    audio: 'https://cdn.example.com/audio.mp3',
    status: 2,
  },
  trace_id: 'trace-456',
  extra_info: {
    audio_length: 5.0,
    audio_sample_rate: 24000,
    audio_size: 120000,
    bitrate: 128000,
    audio_format: 'mp3',
    audio_channel: 1,
    invisible_character_ratio: 0,
    usage_characters: 50,
    usage_voice_count: 1,
    word_count: 10,
  },
  base_resp: {
    status_code: 0,
    status_msg: 'Success',
  },
};

function createModel({
  baseURL = TEST_BASE_URL,
  fetch,
  modelId = 'speech-2.8-hd',
}: {
  baseURL?: string;
  fetch?: FetchFunction;
  modelId?: MinimaxSpeechModelId;
} = {}) {
  return new MinimaxSpeechModel(modelId, {
    provider: 'minimax.speech',
    baseURL,
    headers: () => ({ Authorization: 'Bearer test-key' }),
    fetch,
  });
}

describe('MinimaxSpeechModel', () => {
  const server = createTestServer({
    [SPEECH_URL]: {
      response: { type: 'json-value', body: mockSpeechResponse },
    },
    [`${TEST_BASE_URL}/audio.mp3`]: {
      response: {
        type: 'json-value',
        body: mockSpeechResponseWithURL,
      },
    },
  });

  describe('constructor', () => {
    it('should expose correct provider and model information', () => {
      const model = createModel();

      expect(model.provider).toBe('minimax.speech');
      expect(model.modelId).toBe('speech-2.8-hd');
      expect(model.specificationVersion).toBe('v4');
    });
  });

  describe('doGenerate', () => {
    it('should pass the model and text', async () => {
      await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        model: 'speech-2.8-hd',
        text: 'Hello from the AI SDK!',
        stream: false,
      });
    });

    it('should pass headers', async () => {
      const model = new MinimaxSpeechModel('speech-2.8-hd', {
        provider: 'minimax.speech',
        baseURL: TEST_BASE_URL,
        headers: () => ({
          Authorization: 'Bearer test-key',
          'Custom-Provider-Header': 'provider-header-value',
        }),
      });

      await model.doGenerate({
        text: 'Hello from the AI SDK!',
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should pass voice settings', async () => {
      await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
        providerOptions: {
          minimax: {
            voice_setting: {
              voice_id: 'English_Graceful_Lady',
              speed: 1.5,
              vol: 8,
              pitch: 2,
              emotion: 'happy',
              text_normalization: true,
              latex_read: false,
            },
          },
        },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        voice_setting: {
          voice_id: 'English_Graceful_Lady',
          speed: 1.5,
          vol: 8,
          pitch: 2,
          emotion: 'happy',
          text_normalization: true,
          latex_read: false,
        },
      });
    });

    it('should handle hex output format', async () => {
      const result = await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
        outputFormat: 'hex',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        output_format: 'hex',
      });
      expect(result.audio).toBe(mockAudioHex);
    });

    it('should handle url output format', async () => {
      const audioUrl = `${TEST_BASE_URL}/audio.mp3`;
      const urlResponse = {
        ...mockSpeechResponseWithURL,
        data: {
          ...mockSpeechResponseWithURL.data,
          audio: audioUrl,
        },
      };
      server.urls[SPEECH_URL].response = {
        type: 'json-value',
        body: urlResponse,
      };
      server.urls[audioUrl].response = {
        type: 'binary',
        body: Buffer.from('mock audio data'),
      };

      const result = await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
        outputFormat: 'url',
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        output_format: 'url',
      });
      expect(result.audio).toBeInstanceOf(Uint8Array);
    });

    it('should return hex audio data by default', async () => {
      server.urls[SPEECH_URL].response = {
        type: 'json-value',
        body: mockSpeechResponse,
      };

      const result = await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
      });

      expect(result.audio).toBe(mockAudioHex);
    });

    it('should include response data with timestamp, modelId and headers', async () => {
      server.urls[SPEECH_URL].response = {
        type: 'json-value',
        body: mockSpeechResponse,
        headers: {
          'x-request-id': 'test-request-id',
          'x-ratelimit-remaining': '123',
        },
      };

      const result = await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
      });

      expect(result.response).toMatchObject({
        modelId: 'speech-2.8-hd',
        headers: {
          'x-request-id': 'test-request-id',
          'x-ratelimit-remaining': '123',
        },
      });
      expect(result.response.timestamp).toBeInstanceOf(Date);
    });

    it('should add warning for unsupported output format', async () => {
      const result = await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
        outputFormat: 'mp3' as any,
      });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        type: 'unsupported',
        feature: 'outputFormat',
      });
    });

    it('should handle different model IDs', async () => {
      const modelIds: MinimaxSpeechModelId[] = [
        'speech-2.8-hd',
        'speech-2.8-turbo',
        'speech-2.6-hd',
        'speech-2.6-turbo',
        'speech-02-hd',
        'speech-02-turbo',
        'speech-01-hd',
        'speech-01-turbo',
      ];

      for (const modelId of modelIds) {
        server.urls[SPEECH_URL].response = {
          type: 'json-value',
          body: { ...mockSpeechResponse },
        };

        const model = createModel({ modelId });
        await model.doGenerate({ text: 'Test' });

        const lastCallIndex = server.calls.length - 1;
        expect(await server.calls[lastCallIndex].requestBodyJson).toMatchObject(
          {
            model: modelId,
          },
        );
      }
    });

    it('should handle API errors', async () => {
      server.urls[SPEECH_URL].response = {
        type: 'error',
        status: 400,
        body: JSON.stringify({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid request',
            http_code: 400,
          },
          request_id: 'req-err-001',
        }),
      };

      await expect(
        createModel().doGenerate({
          text: 'Hello from the AI SDK!',
        }),
      ).rejects.toMatchObject({
        name: 'AI_APICallError',
        statusCode: 400,
        message: 'Invalid request',
      });
    });

    it('should handle null data in response', async () => {
      server.urls[SPEECH_URL].response = {
        type: 'json-value',
        body: {
          data: null,
          trace_id: 'trace-123',
          extra_info: {
            audio_length: 0,
            audio_sample_rate: 0,
            audio_size: 0,
            bitrate: 0,
            audio_format: 'mp3',
            audio_channel: 1,
            invisible_character_ratio: 0,
            usage_characters: 0,
            usage_voice_count: 0,
            word_count: 0,
          },
          base_resp: {
            status_code: 0,
            status_msg: 'Success',
          },
        },
      };

      const result = await createModel().doGenerate({
        text: 'Hello from the AI SDK!',
      });

      expect(result.audio).toBe('undefined');
    });
  });
});
