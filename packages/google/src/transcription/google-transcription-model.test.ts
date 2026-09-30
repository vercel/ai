import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { GoogleTranscriptionModel } from './google-transcription-model';

function createModel(modelId = 'gemini-3.5-transcribe') {
  return new GoogleTranscriptionModel(modelId, {
    provider: 'test-provider',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({ 'x-goog-api-key': 'test-api-key' }),
  });
}

describe('doGenerate', () => {
  const server = createTestServer({
    'https://generativelanguage.googleapis.com/v1beta/interactions': {
      response: {
        type: 'json-value',
        body: {
          id: 'interactions/test',
          status: 'completed',
          steps: [
            {
              type: 'model_output',
              content: [{ type: 'text', text: 'Hello world.' }],
            },
          ],
          usage: {
            total_tokens: 10,
            total_input_tokens: 10,
            total_output_tokens: 0,
          },
        },
      },
    },
  });

  it('transcribes audio via the Interactions API with transcription_config', async () => {
    const model = createModel('gemini-3.5-transcribe');

    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: {
          customVocabulary: ['Gemini', 'Kubernetes'],
          languageCodes: ['es-ES'],
          mode: 'SMART',
        },
      },
    });

    expect(result.text).toBe('Hello world.');
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'gemini-3.5-transcribe',
      input: [
        {
          type: 'audio',
          data: 'AQIDBA==',
          mime_type: 'audio/wav',
        },
      ],
      generation_config: {
        transcription_config: {
          language_codes: ['es-ES'],
          custom_vocabulary: ['Gemini', 'Kubernetes'],
          mode: { type: 'smart' },
        },
      },
    });
    expect(server.calls[0].requestHeaders['x-goog-api-key']).toBe(
      'test-api-key',
    );
    expect(result.providerMetadata).toEqual({
      google: {
        usage: {
          total_tokens: 10,
          total_input_tokens: 10,
          total_output_tokens: 0,
        },
      },
    });
  });

  it('maps diarization and word timestamps into the mode object', async () => {
    const model = createModel('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: { diarization: true, wordTimestamp: true },
      },
    });

    const body = (await server.calls[0].requestBodyJson) as {
      generation_config?: { transcription_config?: unknown };
    };
    expect(body.generation_config?.transcription_config).toEqual({
      mode: {
        type: 'verbatim',
        diarization_mode: 'speaker',
        timestamp_granularities: ['word'],
      },
    });
  });

  it('omits generation_config when no transcription options are set', async () => {
    const model = createModel('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {},
    });

    const body = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;
    expect(body.generation_config).toBeUndefined();
  });

  it('extracts word segments from word_info annotations', async () => {
    server.urls[
      'https://generativelanguage.googleapis.com/v1beta/interactions'
    ].response = {
      type: 'json-value',
      body: {
        id: 'interactions/test',
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'text',
                text: 'The quick fox.',
                annotations: [
                  {
                    type: 'word_info',
                    text: 'The',
                    speaker: 'spk:0',
                    start_offset: '0.100s',
                    end_offset: '0.300s',
                  },
                  {
                    type: 'word_info',
                    text: 'quick',
                    speaker: 'spk:0',
                    start_offset: '0.300s',
                    end_offset: '0.600s',
                  },
                  {
                    type: 'word_info',
                    text: 'fox.',
                    speaker: 'spk:0',
                    start_offset: '0.600s',
                    end_offset: '0.900s',
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const model = createModel('gemini-3.5-transcribe');
    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: { wordTimestamp: true },
      },
    });

    expect(result.text).toBe('The quick fox.');
    expect(result.segments).toEqual([
      { text: 'The', startSecond: 0.1, endSecond: 0.3 },
      { text: 'quick', startSecond: 0.3, endSecond: 0.6 },
      { text: 'fox.', startSecond: 0.6, endSecond: 0.9 },
    ]);
  });

  it('rejects unary transcription on live model ids', async () => {
    const model = createModel('gemini-3.5-transcribe-live');

    await expect(
      model.doGenerate({
        audio: new Uint8Array([1]),
        mediaType: 'audio/wav',
        providerOptions: {},
      }),
    ).rejects.toThrow('only supports streaming transcription');
  });
});
