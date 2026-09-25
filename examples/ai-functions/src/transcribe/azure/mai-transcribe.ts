import {
  createAzure,
  type AzureTranscriptionModelOptions,
  type AzureTranscriptionProviderMetadata,
} from '@ai-sdk/azure';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

// Requires a Foundry (Speech) resource in a MAI-Transcribe region, e.g. eastus.
// Uses AZURE_RESOURCE_NAME, or AZURE_SPEECH_BASE_URL for a regional endpoint.
const azure = createAzure({
  baseURL: process.env.AZURE_SPEECH_BASE_URL,
  apiKey: process.env.AZURE_SPEECH_API_KEY ?? process.env.AZURE_API_KEY,
});

run(async () => {
  const result = await transcribe({
    model: azure.transcription('mai-transcribe-2'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      azure: {
        timestamps: 'word',
        transcribeStyle: 'clean',
        diarization: { enabled: true },
        phraseList: { phrases: ['Galileo Galilei', 'STS-34'] },
      } satisfies AzureTranscriptionModelOptions,
    },
  });

  const metadata = result.providerMetadata as
    | AzureTranscriptionProviderMetadata
    | undefined;

  console.log('Text:', result.text);
  console.log('Language:', result.language);
  console.log('Duration (s):', result.durationInSeconds);
  console.log('Segments:', result.segments);
  console.log(
    'Speakers:',
    metadata?.azure.phrases.map(phrase => phrase.speaker),
  );
  console.log('First words:', metadata?.azure.phrases[0]?.words?.slice(0, 5));
});
