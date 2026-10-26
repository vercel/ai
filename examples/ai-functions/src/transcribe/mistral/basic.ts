import {
  mistral,
  type MistralTranscriptionModelOptions,
} from '@ai-sdk/mistral';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: mistral.transcription('voxtral-mini-latest'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      mistral: {
        timestampGranularities: ['segment'],
        diarize: true,
        contextBias: ['Galileo_Galilei'],
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
