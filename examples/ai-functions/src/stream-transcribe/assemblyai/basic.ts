import {
  createAssemblyAI,
  type AssemblyAIProviderSettings,
} from '@ai-sdk/assemblyai';
import { openai } from '@ai-sdk/openai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

// AssemblyAI streaming STT authenticates via the Authorization WebSocket
// header. The native WebSocket in Node.js, browsers, Deno, and Bun cannot send
// headers, so a header-capable implementation (e.g. the `ws` package) is
// required.
const assemblyai = createAssemblyAI({
  webSocket: WebSocket as unknown as AssemblyAIProviderSettings['webSocket'],
});

run(async () => {
  // Generate raw PCM audio (24kHz, 16-bit, mono) to transcribe:
  const speech = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Hello from the AI SDK! Streaming transcription is experimental.',
    outputFormat: 'pcm',
  });

  // Stream the raw audio in chunks, as a microphone would. AssemblyAI requires
  // chunks of 50ms to 1000ms of audio, sent no faster than real time.
  // At 24kHz, 16-bit mono PCM, 4,800 bytes represents 100ms of audio.
  const bytes = speech.audio.uint8Array;
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
      if (offset < bytes.length) {
        await delay(100);
      }
    },
  });

  const result = streamTranscribe({
    model: assemblyai.transcription('universal-3-5-pro'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      assemblyai: {
        keytermsPrompt: ['AI SDK'],
        streaming: {
          mode: 'max_accuracy',
        },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'transcript-partial') {
      console.log('partial:', part.text);
    }

    if (part.type === 'transcript-final') {
      console.log('final:', part.text, part.providerMetadata?.assemblyai);
    }
  }

  console.log('Text:', await result.text);
  console.log('Segments:', await result.segments);
  console.log('Language:', await result.language);
  console.log('Duration:', await result.durationInSeconds);
  console.log('Warnings:', await result.warnings);
});
