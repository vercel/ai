import { elevenLabs } from '@ai-sdk/elevenlabs';
import { openai } from '@ai-sdk/openai';
import { experimental_streamSpeech as streamSpeech, streamText } from 'ai';
import { mkdir, writeFile } from 'node:fs/promises';
import { run } from '../../lib/run';

// Voices a language model's answer while it is still being generated. Real
// deltas can end mid-word; the ElevenLabs provider holds partial words back
// until a word boundary, so no smoothing is needed here.
run(async () => {
  const { textStream } = streamText({
    model: openai('gpt-5.4-nano'),
    prompt: 'In three sentences, explain why the sky is blue.',
  });

  const result = streamSpeech({
    model: elevenLabs.speech('eleven_flash_v2_5'),
    text: textStream,
    outputFormat: { type: 'audio/mpeg' },
  });

  const chunks: Uint8Array[] = [];
  for await (const chunk of result.audioStream) {
    chunks.push(chunk);
  }

  await mkdir('output', { recursive: true });
  const file = `output/stream-speech-stream-text-${Date.now()}.mp3`;
  await writeFile(file, Buffer.concat(chunks));
  console.log('audio:', file, Buffer.concat(chunks).byteLength, 'bytes');
  console.log('usage:', await result.usage);
});
