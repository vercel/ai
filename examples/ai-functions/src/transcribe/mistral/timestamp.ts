import {
  mistral,
  type MistralTranscriptionModelOptions,
} from '@ai-sdk/mistral';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';

async function main() {
  const result = await transcribe({
    model: mistral.transcription('voxtral-mini-latest'),
    audio: await readFile(path.join(__dirname, '../../../data/galileo.mp3')),
    providerOptions: {
      mistral: {
        timestamp_granularities: ['segment'],
      } satisfies MistralTranscriptionModelOptions,
    },
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
