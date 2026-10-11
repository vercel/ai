import fs from 'node:fs';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { createOpenAI } from '../openai-provider';
import { describe, expect, it } from 'vitest';

const server = createTestServer({
  'https://api.openai.com/v1/audio/transcriptions': {
    response: {
      type: 'json-value',
      body: JSON.parse(
        fs.readFileSync(
          'src/transcription/__fixtures__/openai-diarization-empty-live.json',
          'utf8',
        ),
      ),
    },
  },
});

describe('issue #22867', () => {
  it('does not default timestamp granularities for the diarization model', async () => {
    const provider = createOpenAI({ apiKey: 'test-api-key' });

    for (const providerOptions of [
      undefined,
      { openai: {} },
      { openai: { language: 'en' } },
    ]) {
      await provider.transcription('gpt-4o-transcribe-diarize').doGenerate({
        audio: new Uint8Array([0, 0]),
        mediaType: 'audio/wav',
        providerOptions,
      });
    }

    const requests = await Promise.all(
      server.calls.map(async call => {
        const body = await call.requestBodyMultipart;
        return {
          responseFormat: body?.response_format,
          timestampGranularities: body?.['timestamp_granularities[]'],
          language: body?.language,
        };
      }),
    );

    expect(requests).toEqual([
      {
        responseFormat: 'diarized_json',
        timestampGranularities: undefined,
        language: undefined,
      },
      {
        responseFormat: 'diarized_json',
        timestampGranularities: undefined,
        language: undefined,
      },
      {
        responseFormat: 'diarized_json',
        timestampGranularities: undefined,
        language: 'en',
      },
    ]);
  });
});
