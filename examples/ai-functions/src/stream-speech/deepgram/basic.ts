import { deepgram } from '@ai-sdk/deepgram';
import { experimental_streamSpeech as streamSpeech } from 'ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { run } from '../../lib/run';

async function* textDeltas() {
  for (const delta of [
    'Hello from the AI SDK! ',
    'This sentence is streamed to Deepgram Flux ',
    'in small pieces, as a language model would produce it. ',
  ]) {
    yield delta;
  }
}

run(async () => {
  const result = streamSpeech({
    model: deepgram.speech('flux'),
    voice: 'haley',
    text: textDeltas(),
    // Flux TTS streams raw audio: 16-bit PCM, μ-law, or A-law.
    outputFormat: { type: 'audio/pcm', rate: 24000 },
  });

  const chunks: Uint8Array[] = [];
  for await (const chunk of result.audioStream) {
    chunks.push(chunk);
    console.log('audio chunk:', chunk.byteLength, 'bytes');
  }

  // Raw 24 kHz, 16-bit mono PCM. Play it with e.g.
  // ffplay -f s16le -ar 24000 -ch_layout mono <file>
  await mkdir('output', { recursive: true });
  const path = `output/stream-speech-${Date.now()}.pcm`;
  await writeFile(path, Buffer.concat(chunks));
  console.log('saved:', path);
  console.log('usage:', await result.usage);
  console.log('provider metadata:', await result.providerMetadata);
});
