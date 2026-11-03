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
    model: azure.speech('mai-voice-2'),
    // The voice locale selects the language.
    text: 'Hola, esta es una muestra de MAI Voice 2.',
    voice: 'es-MX-Valeria',
    outputFormat: 'wav',
    speed: 0.9,
    providerOptions: {
      azure: {
        style: 'joyful',
        styleDegree: 1.2,
      } satisfies AzureSpeechModelOptions,
    },
  });

  console.log('Audio:', result.audio.mediaType, result.audio.uint8Array.length);
  console.log('Warnings:', result.warnings);

  await saveAudioFile(result.audio);
});
