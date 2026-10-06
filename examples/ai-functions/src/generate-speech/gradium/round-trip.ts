import { gradium } from '@gradium/ai-sdk';
import { generateSpeech, transcribe } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const speech = await generateSpeech({
    model: gradium.speech('default'),
    text: 'Hello from the AI SDK with Gradium!',
    voice: process.env.GRADIUM_VOICE_ID ?? 'YTpq7expH9539ERJ',
    outputFormat: 'wav',
    abortSignal: AbortSignal.timeout(60_000),
  });
  const transcript = await transcribe({
    model: gradium.transcription('default'),
    audio: speech.audio.uint8Array,
    abortSignal: AbortSignal.timeout(60_000),
  });
  console.log('Audio bytes:', speech.audio.uint8Array.byteLength);
  console.log('Text:', transcript.text);
  console.log('Segments:', transcript.segments);
  console.log('Speech metadata:', speech.providerMetadata);
  console.log('Transcription metadata:', transcript.providerMetadata);
});
