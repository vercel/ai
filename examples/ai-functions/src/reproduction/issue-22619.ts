import assert from 'node:assert/strict';
import { createOpenAI } from '@ai-sdk/openai';

type RequestRecord = {
  scenario: string;
  model: string | null;
  responseFormat: string | null;
};

const requests: RequestRecord[] = [];
let scenario = '';

const openai = createOpenAI({
  apiKey: 'synthetic',
  fetch: async (_url, init) => {
    const body = init?.body as FormData;
    requests.push({
      scenario,
      model: body.get('model')?.toString() ?? null,
      responseFormat: body.get('response_format')?.toString() ?? null,
    });
    return Response.json({ text: 'Hello' });
  },
});

const miniModels = [
  'gpt-4o-mini-transcribe',
  'gpt-4o-mini-transcribe-2025-03-20',
  'gpt-4o-mini-transcribe-2025-12-15',
] as const;

async function transcribe(
  name: string,
  model: string,
  openaiOptions?: {
    language?: string;
    responseFormat?: 'json' | 'verbose_json';
  },
) {
  scenario = name;
  await openai.transcription(model).doGenerate({
    audio: new Uint8Array([1, 2]),
    mediaType: 'audio/wav',
    providerOptions:
      openaiOptions == null ? undefined : { openai: openaiOptions },
  });
}

async function main() {
  for (const model of miniModels) {
    await transcribe('no provider options', model);
    await transcribe('language option', model, { language: 'en' });
    await transcribe('explicit json', model, { responseFormat: 'json' });
    await transcribe('explicit verbose_json', model, {
      responseFormat: 'verbose_json',
    });
  }

  await transcribe('whisper without provider options', 'whisper-1');
  await transcribe('whisper with provider options', 'whisper-1', {
    language: 'en',
  });

  console.log(requests);

  assert.deepEqual(
    requests
      .filter(request => request.scenario === 'no provider options')
      .map(request => request.responseFormat),
    [null, null, null],
    'Mini transcription models should not add a response format when provider options are absent',
  );
  assert.deepEqual(
    requests
      .filter(request => request.scenario === 'explicit json')
      .map(request => request.responseFormat),
    ['json', 'json', 'json'],
    'Explicit json response formats should be preserved',
  );
  assert.deepEqual(
    requests
      .filter(request => request.scenario === 'explicit verbose_json')
      .map(request => request.responseFormat),
    ['verbose_json', 'verbose_json', 'verbose_json'],
    'Explicit verbose_json response formats should be preserved',
  );
  assert.deepEqual(
    requests
      .filter(request => request.model === 'whisper-1')
      .map(request => request.responseFormat),
    ['verbose_json', 'verbose_json'],
    'Whisper should continue to default to verbose_json',
  );
  assert.deepEqual(
    requests
      .filter(request => request.scenario === 'language option')
      .map(request => request.responseFormat),
    ['json', 'json', 'json'],
    'Issue #22619: every gpt-4o-mini-transcribe snapshot must default to json when ordinary provider options are set',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
