import assert from 'node:assert/strict';
import { createFal } from '@ai-sdk/fal';

async function transcribe(modelId: 'whisper' | 'wizper') {
  const provider = createFal({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      if (init?.method === 'POST') {
        return Response.json({ request_id: 'request' });
      }

      return Response.json({
        text: 'Bonjour',
        chunks: [{ text: 'Bonjour', timestamp: [0, 1] }],
        ...(modelId === 'wizper'
          ? { languages: ['fr'] }
          : { inferred_languages: ['fr'] }),
      });
    },
  });

  return provider.transcription(modelId).doGenerate({
    audio: new Uint8Array([0]),
    mediaType: 'audio/wav',
    providerOptions: {},
  });
}

async function main() {
  const whisper = await transcribe('whisper');
  assert.equal(whisper.text, 'Bonjour');
  assert.equal(
    whisper.language,
    'fr',
    'Whisper inferred_languages control must be normalized',
  );

  const wizper = await transcribe('wizper');
  assert.equal(wizper.text, 'Bonjour');
  assert.deepEqual(
    (wizper.response.body as { languages?: string[] }).languages,
    ['fr'],
    'Wizper fixture must contain the provider-supplied language',
  );

  if (wizper.language !== 'fr') {
    console.error(
      'ISSUE #22953: Wizper provider language "fr" was normalized as undefined',
    );
    process.exitCode = 1;
  }
}

main();
