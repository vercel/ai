import assert from 'node:assert/strict';
import { createOpenAI } from '@ai-sdk/openai';

type RecordedRequest = {
  model: FormDataEntryValue | null;
  responseFormat: FormDataEntryValue | null;
};

async function main() {
  const requests: RecordedRequest[] = [];
  const provider = createOpenAI({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      assert.ok(init?.body instanceof FormData);
      requests.push({
        model: init.body.get('model'),
        responseFormat: init.body.get('response_format'),
      });
      return Response.json({ text: 'Hello' });
    },
  });

  const transcribe = async (
    modelId: 'gpt-4o-transcribe' | 'whisper-1',
    responseFormat?: 'json',
  ) => {
    await provider.transcription(modelId).doGenerate({
      audio: new Uint8Array([1, 2]),
      mediaType: 'audio/wav',
      providerOptions:
        responseFormat == null ? undefined : { openai: { responseFormat } },
    });
  };

  await transcribe('gpt-4o-transcribe', 'json');
  await transcribe('whisper-1');
  await transcribe('whisper-1', 'json');

  assert.equal(
    requests[0].responseFormat,
    'json',
    'gpt-4o-transcribe must honor an explicit json responseFormat',
  );
  assert.equal(
    requests[1].responseFormat,
    'verbose_json',
    'whisper-1 must retain verbose_json as its default',
  );
  assert.equal(
    requests[2].responseFormat,
    'json',
    `BUG: whisper-1 ignored explicit responseFormat "json"; sent "${requests[2].responseFormat}"`,
  );
}

main();
