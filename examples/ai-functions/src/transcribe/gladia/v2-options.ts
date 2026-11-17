import { gladia, type GladiaTranscriptionModelOptions } from '@ai-sdk/gladia';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: gladia.transcription('solaria-3'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      gladia: {
        languageConfig: { languages: ['en'], codeSwitching: false },
        piiRedaction: true,
        piiRedactionConfig: { processedTextType: 'MARKER' },
      } satisfies GladiaTranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Language:', result.language);
  console.log('Duration:', result.durationInSeconds);
  console.log('Warnings:', result.warnings);
});
