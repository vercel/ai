import { createAzure, type AzureSpeechModelOptions } from '@ai-sdk/azure';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';
import { saveAudioFile } from '../../lib/save-audio';

// Requires a Foundry (Speech) resource in a MAI-Voice region, e.g. eastus.
// Uses AZURE_RESOURCE_NAME, or AZURE_SPEECH_BASE_URL for a regional endpoint.
const azure = createAzure({
  speechBaseURL: process.env.AZURE_SPEECH_BASE_URL,
  apiKey: process.env.AZURE_SPEECH_API_KEY ?? process.env.AZURE_API_KEY,
});

run(async () => {
  const result = await generateSpeech({
    model: azure.speech('mai-voice-2.1'), // or 'mai-voice-2.1-flash'
    text: 'Hello from the AI SDK! This is MAI-Voice-2.1 narrating.',
    voice: 'en-US-Grant',
    providerOptions: {
      azure: { style: 'narrator' } satisfies AzureSpeechModelOptions,
    },
  });

  console.log('Audio:', result.audio.mediaType, result.audio.uint8Array.length);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
