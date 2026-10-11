import assert from 'node:assert/strict';
import { createFal } from '@ai-sdk/fal';

async function main() {
  const requestBodies: Array<{ chunk_level?: string }> = [];
  const model = createFal({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      if (init?.method === 'POST') {
        requestBodies.push(JSON.parse(String(init.body)));
        return Response.json({ request_id: 'job' });
      }

      return Response.json({
        text: 'hello',
        chunks: [],
        inferred_languages: ['en'],
      });
    },
  }).transcription('whisper');

  for (const providerOptions of [
    undefined,
    { fal: {} },
    { fal: { diarize: false } },
    { fal: { chunkLevel: 'word' } },
    { fal: { chunkLevel: 'segment' } },
  ]) {
    await model.doGenerate({
      audio: new Uint8Array([0]),
      mediaType: 'audio/wav',
      ...(providerOptions == null ? {} : { providerOptions }),
    });
  }

  const levels = requestBodies.map(body => body.chunk_level);
  console.log({ levels });

  assert.equal(
    levels[3],
    'word',
    'Explicit word chunk level was not preserved',
  );
  assert.equal(
    levels[4],
    'segment',
    'Explicit segment chunk level was not preserved',
  );

  const mismatches = [
    levels[0] === levels[1]
      ? undefined
      : `empty fal options changed chunk_level from ${levels[0]} to ${levels[1]}`,
    levels[0] === levels[2]
      ? undefined
      : `diarize:false changed chunk_level from ${levels[0]} to ${levels[2]}`,
  ].filter((message): message is string => message != null);

  assert.deepEqual(mismatches, [], `BUG: ${mismatches.join('; ')}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
