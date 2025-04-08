import { openai } from '@ai-sdk/openai';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const result = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: Buffer.from(await readFile('./data/galileo.mp3')).toString('base64'),
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
}

main().catch(console.error);
