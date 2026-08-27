import { deepgram } from '@ai-sdk/deepgram';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: deepgram.transcription('nova-3'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      // keyterm boosting is the nova-3-recommended way to improve
      // recognition of domain terms.
      deepgram: { keyterm: 'Galileo' },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
});
