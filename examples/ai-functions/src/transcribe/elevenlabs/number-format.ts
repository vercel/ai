import { elevenLabs } from '@ai-sdk/elevenlabs';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: elevenLabs.transcription('scribe_v3'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      elevenlabs: {
        languageCode: 'en',
        // Write numbers as words, e.g. "forty-two" instead of "42".
        numbersFormat: 'words',
        // Other languages that may be spoken in the audio.
        secondaryLanguageCodes: ['it'],
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Language:', result.language);
  console.log('Warnings:', result.warnings);
});
