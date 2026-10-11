import assert from 'node:assert/strict';
import { createFal } from '@ai-sdk/fal';

const audioUrl = 'https://fal.run/synthetic.mp3';
const failureSignal =
  'fal MiniMax standard voice/speed were not mapped to voice_setting';

async function main() {
  const requestBodies: Array<Record<string, unknown>> = [];
  const model = createFal({
    apiKey: 'synthetic',
    fetch: async (url, init) => {
      if (init?.method === 'POST') {
        const body = init.body;
        if (typeof body !== 'string') {
          throw new TypeError('Expected a JSON request body');
        }
        requestBodies.push(JSON.parse(body));

        return Response.json({
          audio: { url: audioUrl },
          duration_ms: 10,
        });
      }

      assert.equal(String(url), audioUrl);
      return new Response(new Uint8Array([73, 68, 51, 0]), {
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  }).speech('fal-ai/minimax/speech-02-hd');

  const standardResult = await model.doGenerate({
    text: 'Hello',
    voice: 'Friendly_Person',
    speed: 1.5,
  });
  await model.doGenerate({
    text: 'Hello',
    providerOptions: {
      fal: {
        voice_setting: {
          voice_id: 'Friendly_Person',
          speed: 1.5,
        },
      },
    },
  });

  assert.deepEqual(requestBodies[1].voice_setting, {
    voice_id: 'Friendly_Person',
    speed: 1.5,
  });
  assert.deepEqual(standardResult.warnings, []);
  assert.deepEqual(
    requestBodies[0],
    {
      text: 'Hello',
      output_format: 'url',
      voice_setting: {
        voice_id: 'Friendly_Person',
        speed: 1.5,
      },
    },
    failureSignal,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
