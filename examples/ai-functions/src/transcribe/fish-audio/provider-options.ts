import {
  fishAudio,
  type FishAudioTranscriptionModelOptions,
} from '@ai-sdk/fish-audio';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: fishAudio.transcription(),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      fishAudio: {
        // A hint only: Fish Audio detects the language regardless, and
        // `result.language` reports what it detected.
        language: 'en',
        // The provider requests timestamps by default so that `segments` is
        // populated. Setting this to true returns an empty `segments` array.
        ignoreTimestamps: false,
      } satisfies FishAudioTranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
});
