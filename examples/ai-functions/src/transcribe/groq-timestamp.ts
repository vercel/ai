import { groq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';

async function main() {
  const result = await transcribe({
    model: groq.transcription('whisper-large-v3-turbo'),
    audio: await readFile(path.join(__dirname, '../../data/galileo.mp3')),
    providerOptions: {
      groq: {
        language: 'en',
        timestampGranularities: ['word', 'segment'],
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments); // Read just the segments
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses); // Read the full response including words and segments
}

main().catch(console.error);
