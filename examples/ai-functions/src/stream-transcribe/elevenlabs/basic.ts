import {
  createElevenLabs,
  type ElevenLabsProviderSettings,
} from '@ai-sdk/elevenlabs';
import { openai } from '@ai-sdk/openai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

// ElevenLabs realtime STT authenticates via WebSocket headers. The native
// WebSocket in Node.js, browsers, Deno, and Bun cannot send headers, so a
// header-capable implementation (e.g. the `ws` package) is required.
const elevenLabs = createElevenLabs({
  webSocket: WebSocket as unknown as ElevenLabsProviderSettings['webSocket'],
});

run(async () => {
  // Generate raw PCM audio (24kHz, 16-bit, mono) to transcribe:
  const speech = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Hello from the AI SDK! Streaming transcription is experimental.',
    outputFormat: 'pcm',
  });

  // Stream the raw audio in chunks, as a microphone would.
  const bytes = speech.audio.uint8Array;
  // At 24kHz, 16-bit mono PCM, 4,800 bytes represents 100ms of audio.
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
    model: elevenLabs.transcription('scribe_v2_realtime'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      elevenlabs: {
        streaming: {
          includeLanguageDetection: true,
          includeTimestamps: true,
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
  console.log('Language:', await result.language);
  console.log('Duration:', await result.durationInSeconds);
  console.log('Warnings:', await result.warnings);
});
