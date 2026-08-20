import {
  spacexai,
  type SpaceXAITranscriptionModelOptions,
} from '@ai-sdk/spacexai';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: spacexai.transcription(),
    audio: Buffer.from(await readFile('./data/galileo.mp3')).toString('base64'),
    providerOptions: {
      spacexai: {
        language: 'en',
        format: true,
        keyterm: ['Galileo', 'Jupiter'],
      } satisfies SpaceXAITranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
});
