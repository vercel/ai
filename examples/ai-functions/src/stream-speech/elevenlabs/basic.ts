import {
  createElevenLabs,
  type ElevenLabsProviderSettings,
} from '@ai-sdk/elevenlabs';
import { experimental_streamSpeech as streamSpeech } from 'ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

// ElevenLabs authenticates the WebSocket with a header, which the native
// WebSocket in Node.js, browsers, Deno, and Bun cannot send.
const elevenLabs = createElevenLabs({
  webSocket: WebSocket as unknown as ElevenLabsProviderSettings['webSocket'],
});

async function* textDeltas() {
  for (const delta of [
    'Hello from the AI SDK! ',
    'This sentence is streamed to ElevenLabs ',
    'in small pieces, as a language model would produce it. ',
  ]) {
    yield delta;
  }
}

run(async () => {
  const result = streamSpeech({
    model: elevenLabs.speech('eleven_flash_v2_5'),
    text: textDeltas(),
    outputFormat: 'mp3_44100_128',
  });

  const chunks: Uint8Array[] = [];
  for await (const chunk of result.audioStream) {
    chunks.push(chunk);
    console.log('audio chunk:', chunk.byteLength, 'bytes');
  }

  await mkdir('output', { recursive: true });
  await writeFile(
    `output/stream-speech-${Date.now()}.mp3`,
    Buffer.concat(chunks),
  );
  console.log('usage:', await result.usage);
});
