import { deepgram } from '@ai-sdk/deepgram';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../../lib/run';

run(async () => {
  // Flux TTS produces the test audio: raw 16 kHz, 16-bit mono PCM.
  const speech = await generateSpeech({
    model: deepgram.speech('flux'),
    voice: 'haley',
    text: 'Hello from the AI SDK! Flux detects when a speaker has finished their turn.',
    outputFormat: 'pcm',
    providerOptions: { deepgram: { sampleRate: 16000 } },
  });

  // Two seconds of trailing silence let Flux end the turn on its own.
  const bytes = new Uint8Array(speech.audio.uint8Array.length + 64000);
  bytes.set(speech.audio.uint8Array);
  // Flux recommends 80ms chunks (2560 bytes here), paced like microphone input.
  const chunkSize = 2560;
  let offset = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      await delay(80);
    },
  });

  const result = streamTranscribe({
    model: deepgram.transcription('flux-general-en'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      deepgram: { streaming: { eotThreshold: 0.7, eotTimeoutMs: 3000 } },
    },
    abortSignal: AbortSignal.timeout(60000),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (
      part.type === 'transcript-partial' ||
      part.type === 'transcript-final'
    ) {
      // providerMetadata.deepgram.event is the Flux turn event, e.g.
      // StartOfTurn, Update, or EndOfTurn.
      console.log(
        part.type,
        part.providerMetadata?.deepgram?.event,
        JSON.stringify(part.text),
      );
    }
  }

  console.log('Text:', await result.text);
  console.log('Segments:', await result.segments);
  console.log('Duration:', await result.durationInSeconds);
});
