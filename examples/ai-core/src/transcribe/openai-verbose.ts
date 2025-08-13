import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const result = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      openai: {
        //timestampGranularities: ['word'],
        timestampGranularities: ['segment'],
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Word-level segments:', result.segments);
  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
