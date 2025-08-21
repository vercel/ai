import { groq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const result = await transcribe({
    model: groq.transcription('whisper-large-v3-turbo'),
    audio: Buffer.from(await readFile('./data/galileo.mp3')).toString('base64'),
    providerOptions: {
      groq: {
        responseFormat: 'verbose_json',
      },
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
}

main().catch(console.error);
