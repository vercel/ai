import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../lib/run';

run(async () => {
  const result = await transcribe({
    model: openai.transcription('gpt-4o-transcribe-diarize'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      openai: {
        chunkingStrategy: 'auto',
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  // The full response body
  // console.log('Responses:', result.responses[0].body.segments);
  console.log('Responses:', result.responses);
});
