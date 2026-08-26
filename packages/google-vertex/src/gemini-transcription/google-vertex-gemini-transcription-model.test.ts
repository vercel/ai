import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it, vi } from 'vitest';
import { createVertex } from '../google-vertex-provider';
import { GoogleVertexGeminiTranscriptionModel } from './google-vertex-gemini-transcription-model';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const provider = createVertex({
  project: 'test-project',
  location: 'us-central1',
  headers: { authorization: 'Bearer test-token' },
});

const generateContentURL =
  'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/publishers/google/models/gemini-3.5-transcribe:generateContent';

describe('provider dispatch', () => {
  it('routes gemini model ids to the Gemini transcription model', () => {
    const model = provider.transcription('gemini-3.5-transcribe');
    expect(model).toBeInstanceOf(GoogleVertexGeminiTranscriptionModel);
    expect(model.provider).toBe('google.vertex.transcription');
  });
});

describe('doGenerate', () => {
  const server = createTestServer({
    [generateContentURL]: {
      response: {
        type: 'json-value',
        body: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello ' }, { text: 'world.' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 4,
          },
        },
      },
    },
  });

  it('transcribes audio via generateContent with audioTranscriptionConfig', async () => {
    const model = provider.transcription('gemini-3.5-transcribe');

    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        googleVertex: {
          customVocabulary: ['Gemini', 'Kubernetes'],
          languageCodes: ['es-ES'],
          mode: 'SMART',
        },
      },
    });

    expect(result.text).toBe('Hello world.');
    expect(await server.calls[0].requestBodyJson).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: 'AQIDBA==',
              },
            },
          ],
        },
      ],
      generationConfig: {
        audioTranscriptionConfig: {
          languageCodes: ['es-ES'],
          customVocabulary: ['Gemini', 'Kubernetes'],
          mode: 'SMART',
        },
      },
    });
    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer test-token',
    );
    expect(result.providerMetadata).toEqual({
      google: {
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 4,
        },
      },
    });
  });

  it('accepts provider options under the google namespace as a fallback', async () => {
    const model = provider.transcription('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {
        google: { mode: 'VERBATIM' },
      },
    });

    const body = (await server.calls[0].requestBodyJson) as {
      generationConfig?: { audioTranscriptionConfig?: { mode?: string } };
    };
    expect(body.generationConfig?.audioTranscriptionConfig?.mode).toBe(
      'VERBATIM',
    );
  });

  it('omits generationConfig when no transcription options are set', async () => {
    const model = provider.transcription('gemini-3.5-transcribe');

    await model.doGenerate({
      audio: new Uint8Array([1, 2, 3, 4]),
      mediaType: 'audio/wav',
      providerOptions: {},
    });

    const body = (await server.calls[0].requestBodyJson) as Record<
      string,
      unknown
    >;
    expect(body.generationConfig).toBeUndefined();
  });

  it('rejects unary transcription on live model ids', async () => {
    const model = provider.transcription('gemini-3.5-transcribe-live');

    await expect(
      model.doGenerate({
        audio: new Uint8Array([1]),
        mediaType: 'audio/wav',
        providerOptions: {},
      }),
    ).rejects.toThrow('only supports streaming transcription');
  });
});
