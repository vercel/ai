import {
  createAzure,
  type AzureTranscriptionModelOptions,
} from '@ai-sdk/azure';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

// Requires a Foundry (Speech) resource in a MAI-Transcribe region, e.g. eastus.
// Uses AZURE_RESOURCE_NAME, or AZURE_SPEECH_BASE_URL for a regional endpoint.
const azure = createAzure({
  speechBaseURL: process.env.AZURE_SPEECH_BASE_URL,
  apiKey: process.env.AZURE_SPEECH_API_KEY ?? process.env.AZURE_API_KEY,
});

run(async () => {
  const result = await transcribe({
    model: azure.transcription('mai-transcribe-1.5'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      // MAI-Transcribe-1.5 supports phrase lists and locales, but not
      // diarization, word or segment timestamps, or the clean style.
      azure: {
        phraseList: { phrases: ['Galileo Galilei', 'STS-34'] },
      } satisfies AzureTranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Language:', result.language);
  console.log('Duration (s):', result.durationInSeconds);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
});
