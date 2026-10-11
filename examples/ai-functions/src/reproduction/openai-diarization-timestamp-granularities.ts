import assert from 'node:assert/strict';
import { createOpenAI } from '@ai-sdk/openai';

type RequestObservation = {
  model: string | null;
  responseFormat: string | null;
  timestampGranularities: FormDataEntryValue[];
  language: string | null;
};

async function main() {
  const requests: RequestObservation[] = [];
  const openai = createOpenAI({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      assert.ok(init?.body instanceof FormData);

      requests.push({
        model: init.body.get('model')?.toString() ?? null,
        responseFormat: init.body.get('response_format')?.toString() ?? null,
        timestampGranularities: init.body.getAll('timestamp_granularities[]'),
        language: init.body.get('language')?.toString() ?? null,
      });

      return Response.json({
        text: 'Synthetic transcript',
        duration: 1,
        segments: [],
      });
    },
  });

  for (const providerOptions of [
    undefined,
    { openai: {} },
    { openai: { language: 'en' } },
  ]) {
    await openai.transcription('gpt-4o-transcribe-diarize').doGenerate({
      audio: new Uint8Array([0, 0]),
      mediaType: 'audio/wav',
      providerOptions,
    });
  }

  await openai.transcription('whisper-1').doGenerate({
    audio: new Uint8Array([0, 0]),
    mediaType: 'audio/wav',
    providerOptions: { openai: {} },
  });

  assert.deepEqual(
    requests,
    [
      {
        model: 'gpt-4o-transcribe-diarize',
        responseFormat: 'diarized_json',
        timestampGranularities: [],
        language: null,
      },
      {
        model: 'gpt-4o-transcribe-diarize',
        responseFormat: 'diarized_json',
        timestampGranularities: [],
        language: null,
      },
      {
        model: 'gpt-4o-transcribe-diarize',
        responseFormat: 'diarized_json',
        timestampGranularities: [],
        language: 'en',
      },
      {
        model: 'whisper-1',
        responseFormat: 'verbose_json',
        timestampGranularities: ['segment'],
        language: null,
      },
    ],
    'ISSUE_22867: gpt-4o-transcribe-diarize must not gain default timestamp_granularities when provider options are present',
  );
}

main();
