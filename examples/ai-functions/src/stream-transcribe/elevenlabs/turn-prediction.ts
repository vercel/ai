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

// At 24kHz, 16-bit mono PCM, 4,800 bytes represents 100ms of audio.
const chunkSize = 4800;

run(async () => {
  // Generate two turns of raw PCM audio (24kHz, 16-bit, mono), separated by
  // three seconds of silence:
  const turns = await Promise.all(
    [
      'What time does the pharmacy on Main Street open tomorrow?',
      'And can you tell me whether they are open on Sunday?',
    ].map(text =>
      generateSpeech({
        model: openai.speech('gpt-4o-mini-tts'),
        text,
        outputFormat: 'pcm',
      }),
    ),
  );
  const [first, second] = turns.map(turn => turn.audio.uint8Array);
  const silenceLength = chunkSize * 30;
  const bytes = new Uint8Array(first.length + silenceLength + second.length);
  bytes.set(first, 0);
  bytes.set(second, first.length + silenceLength);

  // Stream the raw audio in chunks, as a microphone would.
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
    model: elevenLabs.transcription('scribe_v3_live'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      elevenlabs: {
        streaming: {
          // Commit a transcript when the model predicts the speaker has
          // finished their turn, instead of only when the audio input ends.
          commitStrategy: 'turn_prediction',
        },
      },
    },
  });

  // Each committed turn arrives as a transcript-final part.
  for await (const part of result.fullStream) {
    if (part.type === 'transcript-partial') {
      console.log('partial:', part.text);
    }

    if (part.type === 'transcript-final') {
      console.log('final:', part.text);
    }
  }

  console.log('Text:', await result.text);
  console.log('Warnings:', await result.warnings);
});
