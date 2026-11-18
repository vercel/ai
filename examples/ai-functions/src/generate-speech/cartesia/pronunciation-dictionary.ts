import { cartesia, type CartesiaSpeechModelOptions } from '@ai-sdk/cartesia';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  // Create a dictionary using https://docs.cartesia.ai/api-reference/pronunciation-dicts/create
  // and set its ID in examples/ai-functions/.env.
  const pronunciationDictionaryId =
    process.env.CARTESIA_PRONUNCIATION_DICTIONARY_ID;

  if (!pronunciationDictionaryId) {
    throw new Error(
      'Set CARTESIA_PRONUNCIATION_DICTIONARY_ID to an existing dictionary ID.',
    );
  }

  const result = await generateSpeech({
    model: cartesia.speech('sonic-3.5'),
    text: 'Vercel makes this possible.',
    voice: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    providerOptions: {
      cartesia: {
        pronunciationDictionaryId,
      } satisfies CartesiaSpeechModelOptions,
    },
  });

  console.log('Warnings:', result.warnings);
  await saveAudioFile(result.audio);
});
