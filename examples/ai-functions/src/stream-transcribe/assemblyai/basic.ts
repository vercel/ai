import {
  createAssemblyAI,
  type AssemblyAIProviderSettings,
} from '@ai-sdk/assemblyai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

// AssemblyAI streaming STT authenticates via a WebSocket header. The native
// WebSocket in Node.js, browsers, Deno, and Bun cannot send headers, so a
// header-capable implementation (e.g. the `ws` package) is required.
const assemblyai = createAssemblyAI({
  webSocket: WebSocket as unknown as AssemblyAIProviderSettings['webSocket'],
});

run(async () => {
  // Generate raw PCM audio (16kHz, 16-bit, mono) to transcribe:
  const speech = await generateSpeech({
    model: assemblyai.speech('assemblyai-tts-1'),
    text: 'Hello from the AI SDK! Streaming transcription is experimental.',
    outputFormat: 'pcm',
    providerOptions: { assemblyai: { sampleRate: 16000 } },
  });

  // Stream the raw audio in chunks, as a microphone would.
  const bytes = speech.audio.uint8Array;
  // At 16kHz, 16-bit mono PCM, 3,200 bytes represents 100ms of audio.
  const chunkSize = 3200;
  let offset = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }

      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      if (offset < bytes.length) {
        await delay(100);
      }
    },
  });

  const result = streamTranscribe({
    model: assemblyai.transcription('assemblyai-stt-3-7-realtime'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      assemblyai: {
        streaming: {
          keytermsPrompt: ['AI SDK'],
          languageDetection: true,
        },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'transcript-partial') {
      console.log('partial:', part.text);
    }

    if (part.type === 'transcript-final') {
      console.log('final:', part.text);
    }
  }

  console.log('Text:', await result.text);
  console.log('Segments:', await result.segments);
  console.log('Language:', await result.language);
  console.log('Duration:', await result.durationInSeconds);
  console.log('Warnings:', await result.warnings);
});
