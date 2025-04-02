import { openai } from '@ai-sdk/openai';
import { experimental_generateTranscript as generateTranscript } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

async function main() {
  const result = await generateTranscript({
    model: openai.transcription('whisper-1'),
    audio: await readFile('audio.mp3'),
  });

  console.log(result.transcript);
  console.log();
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
}

main().catch(console.error);
