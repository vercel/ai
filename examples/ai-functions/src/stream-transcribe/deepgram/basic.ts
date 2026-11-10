import { deepgram } from '@ai-sdk/deepgram';
import { openai } from '@ai-sdk/openai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../../lib/run';

run(async () => {
  const speech = await generateSpeech({
    model: openai.speech('gpt-4o-mini-tts'),
    text: 'Hello from the AI SDK! Deepgram can transcribe live audio as it arrives.',
    outputFormat: 'pcm',
  });

  const bytes = speech.audio.uint8Array;
  // 100ms of 24kHz, 16-bit mono PCM, paced like microphone input.
  const chunkSize = 4800;
  let offset = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      await delay(100);
    },
  });

  const result = streamTranscribe({
    model: deepgram.transcription('nova-3'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      deepgram: { language: 'en', streaming: { interimResults: true } },
    },
    abortSignal: AbortSignal.timeout(60000),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (
      part.type === 'transcript-partial' ||
      part.type === 'transcript-final'
    ) {
      console.log(part.type, part.text);
    }
  }

  console.log('Text:', await result.text);
  console.log('Segments:', await result.segments);
  console.log('Duration:', await result.durationInSeconds);
});
