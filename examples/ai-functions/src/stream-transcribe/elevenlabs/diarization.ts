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
  // Generate a two-speaker conversation as raw PCM audio (24kHz, 16-bit,
  // mono), with a second of silence between the speakers:
  const turns = await Promise.all(
    [
      { voice: 'alloy', text: 'Hi, did the probe data arrive yet?' },
      { voice: 'onyx', text: 'Yes, it came in this morning. I will send it.' },
    ].map(({ voice, text }) =>
      generateSpeech({
        model: openai.speech('gpt-4o-mini-tts'),
        voice,
        text,
        outputFormat: 'pcm',
      }),
    ),
  );
  const [first, second] = turns.map(turn => turn.audio.uint8Array);
  const silenceLength = chunkSize * 10;
  const bytes = new Uint8Array(first.length + silenceLength + second.length);
  bytes.set(first, 0);
  bytes.set(second, first.length + silenceLength);

  const result = streamTranscribe({
    model: elevenLabs.transcription('scribe_v3_live'),
    audio: streamAudio(bytes),
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      elevenlabs: {
        streaming: { diarize: true },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'transcript-final') {
      console.log('final:', part.text);
    }
  }

  // ElevenLabs sends speaker labels after each committed transcript. They are
  // returned once the stream has finished.
  const diarizedTranscripts = (await result.providerMetadata).elevenlabs
    ?.diarizedTranscripts as Array<{
    words: Array<{ text: string; speaker_id: string | null }>;
  }>;

  for (const transcript of diarizedTranscripts) {
    let speaker: string | null | undefined;
    let text = '';
    for (const word of transcript.words) {
      if (word.speaker_id !== speaker && text.trim().length > 0) {
        console.log(`${speaker ?? 'unknown'}:`, text.trim());
        text = '';
      }
      speaker = word.speaker_id;
      text += word.text;
    }
    console.log(`${speaker ?? 'unknown'}:`, text.trim());
  }
});
