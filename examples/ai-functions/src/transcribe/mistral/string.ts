import {
  mistral,
  type MistralTranscriptionModelOptions,
} from '@ai-sdk/mistral';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: mistral.transcription('voxtral-mini-latest'),
    audio: Buffer.from(await readFile('./data/galileo.mp3')).toString('base64'),
    providerOptions: {
      mistral: {
        timestamp_granularities: 'segment',
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
});
