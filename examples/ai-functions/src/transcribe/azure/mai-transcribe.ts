import { azure, type AzureTranscriptionModelOptions } from '@ai-sdk/azure';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  // AZURE_RESOURCE_NAME and AZURE_API_KEY must belong to a Speech resource.
  const result = await transcribe({
    model: azure.transcription('mai-transcribe-2'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      azure: {
        // Optional for MAI-Transcribe-2. Also forwarded by AI Gateway.
        api: 'speech',
        timestamps: 'word',
        diarization: { enabled: true },
      } satisfies AzureTranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Segments:', result.segments);
  console.log('Language:', result.language);
  console.log('Metadata:', result.providerMetadata);
});
