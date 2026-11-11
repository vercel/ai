import { deepgram } from '@ai-sdk/deepgram';
import { generateSpeech, transcribe } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Aura-2 produces a short clinical note to transcribe.
  const speech = await generateSpeech({
    model: deepgram.speech('aura-2'),
    voice: 'thalia',
    text: 'The patient was prescribed ten milligrams of atorvastatin daily for hyperlipidemia, and metformin for type two diabetes.',
  });

  // Nova-3 Medical is an English model tuned for clinical vocabulary.
  const result = await transcribe({
    model: deepgram.transcription('nova-3-medical'),
    audio: speech.audio.uint8Array,
    providerOptions: {
      deepgram: { smartFormat: true },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Warnings:', result.warnings);
});
