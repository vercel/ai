import { cartesia, type CartesiaSpeechModelOptions } from '@ai-sdk/cartesia';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: cartesia.speech('sonic-3.6'),
    text: 'Your appointment is on 03/04/2026 at 2 PM.',
    voice: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    providerOptions: {
      cartesia: {
        locale: 'en-GB',
        // Select US date-reading conventions independently of the speech locale.
        normalization: 'en-US',
      } satisfies CartesiaSpeechModelOptions,
    },
  });

  console.log('Warnings:', result.warnings);
  await saveAudioFile(result.audio);
});
