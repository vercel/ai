import { createDeepgram } from '@ai-sdk/deepgram';
import assert from 'node:assert/strict';

async function main() {
  const requestBodies: Uint8Array[] = [];
  const provider = createDeepgram({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      assert.ok(init?.body);
      requestBodies.push(
        new Uint8Array(await new Response(init.body).arrayBuffer()),
      );

      return Response.json({
        metadata: { duration: 1 },
        results: {
          channels: [
            {
              alternatives: [{ transcript: 'hello', words: [] }],
            },
          ],
        },
      });
    },
  });
  const model = provider.transcription('nova-3');
  const audioBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 1, 2, 3]);

  await model.doGenerate({
    audio: audioBytes,
    mediaType: 'audio/wav',
    providerOptions: {},
  });
  await model.doGenerate({
    audio: Buffer.from(audioBytes).toString('base64'),
    mediaType: 'audio/wav',
    providerOptions: {},
  });

  assert.equal(requestBodies.length, 2);
  assert.deepEqual(
    requestBodies[0],
    audioBytes,
    'Uint8Array input should be sent as its original audio bytes',
  );
  assert.deepEqual(
    requestBodies[1],
    audioBytes,
    'ISSUE_22945: base64 input was sent as ASCII instead of decoded audio bytes',
  );
}

main();
