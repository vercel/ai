import { openai } from '@ai-sdk/openai';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: openai.transcription('gpt-transcribe'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      openai: {
        prompt: 'A spoken recording about the Galileo space probe and Jupiter.',
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Language:', result.language);
});
