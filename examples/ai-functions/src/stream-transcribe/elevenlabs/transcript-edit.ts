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

// Stream raw audio in chunks, as a microphone would.
function streamAudio(bytes: Uint8Array) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
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
}

run(async () => {
  // Generate raw PCM audio (24kHz, 16-bit, mono) to transcribe:
  const speech = await generateSpeech({
    model: openai.speech('gpt-4o-mini-tts'),
    text: 'Our next meeting is on the twelfth of July, twenty twenty-six.',
    outputFormat: 'pcm',
  });

  const result = streamTranscribe({
    model: elevenLabs.transcription('scribe_v3_live'),
    audio: streamAudio(speech.audio.uint8Array),
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      elevenlabs: {
        streaming: {
          transcriptEdit: 'Write all dates in ISO 8601 format (YYYY-MM-DD).',
        },
      },
    },
  });

  // Transcript parts and the result text are not edited.
  console.log('Text:', await result.text);

  // ElevenLabs sends the edited text after each committed transcript. It is
  // returned once the stream has finished.
  console.log(
    'Edited:',
    JSON.stringify(
      (await result.providerMetadata).elevenlabs?.editedTranscripts,
      null,
      2,
    ),
  );
});
