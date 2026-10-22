import { mistral, type MistralSpeechModelOptions } from '@ai-sdk/mistral';
import { generateSpeech } from 'ai';
import { saveAudioFile } from '../../lib/save-audio';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: mistral.speech('voxtral-mini-tts-3-0'),
    text: '[emotion=happy] Hello from the AI SDK! I like tomato soup.',
    voice: 'gb_jane_neutral',
    providerOptions: {
      mistral: {
        expressiveness: 1.5,
        phonemeHints: { tomato: ['t', 'ə', 'm', 'ɑ', 't', 'oʊ'] },
      } satisfies MistralSpeechModelOptions,
    },
  });

  console.log('Audio bytes:', result.audio.uint8Array.length);
  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
