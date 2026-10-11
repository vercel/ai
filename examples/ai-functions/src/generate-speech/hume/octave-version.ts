import { createHume, type HumeSpeechModelOptions } from '@ai-sdk/hume';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  let requestBody: unknown;

  const hume = createHume({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(init?.body as string);

      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'content-type': 'audio/mpeg',
        },
      });
    },
  });

  const result = await generateSpeech({
    model: hume.speech(),
    text: 'Hello from Octave 2!',
    providerOptions: {
      hume: {
        version: '2',
      } satisfies HumeSpeechModelOptions,
    },
  });

  console.log('Request:', requestBody);
  console.log('Warnings:', result.warnings);
});
