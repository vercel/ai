import {
  createAzure,
  type AzureTranscriptionModelOptions,
} from '@ai-sdk/azure';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

// Requires a Foundry resource with a `mai-transcribe-2-streaming` deployment in
// a supported region (e.g. eastus2). Uses AZURE_RESOURCE_NAME and AZURE_API_KEY.
const azure = createAzure({
  // `ws` sends the api-key header; native WebSocket falls back to a query param.
  webSocket: WebSocket,
});

run(async () => {
  // generate raw PCM audio (24kHz, 16-bit, mono) to transcribe:
  const speech = await generateSpeech({
    model: azure.speech('mai-voice-2.1-flash'),
    text: 'Hello from the AI SDK! This is streaming transcription with MAI.',
    voice: 'en-US-Grant',
    outputFormat: 'pcm',
  });

  // stream the raw audio in 20ms chunks, as a microphone would:
  const bytes = speech.audio.uint8Array;
  const chunkSize = 960;
  const audio = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      controller.close();
    },
  });

  const result = streamTranscribe({
    model: azure.transcription('mai-transcribe-2-streaming'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      azure: { language: 'en' } satisfies AzureTranscriptionModelOptions,
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'transcript-delta') {
      process.stdout.write(part.delta);
    } else if (part.type === 'transcript-partial') {
      process.stdout.write(`\x1b[2m[${part.text}]\x1b[0m`);
    }
  }
  console.log();

  console.log('Text:', await result.text);
  console.log('Duration:', await result.durationInSeconds);
  console.log('Warnings:', await result.warnings);
});
