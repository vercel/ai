import { cartesia } from '@ai-sdk/cartesia';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: cartesia.speech('sonic-3.5'),
    text: 'Take a breath. Everything is going to be fine.',
    voice: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    providerOptions: {
      cartesia: {
        volume: 0.8,
        emotion: 'calm',
      },
    },
  });

  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
