import { google } from '@ai-sdk/google';
import { experimental_streamSpeech as streamSpeech } from 'ai';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await streamSpeech({
    model: google.speech('gemini-3.1-flash-tts-preview'),
    text: 'Say cheerfully: Have a wonderful day!',
    voice: 'Kore',
  });

  await mkdir('output', { recursive: true });
  const file = `output/speech-${Date.now()}.pcm`;
  await pipeline(result.audioStream, createWriteStream(file));

  console.log(`Saved raw PCM to ${file}`);
  console.log(`Play with: ffplay -f s16le -ar 24000 -ac 1 ${file}`);
  console.log('Warnings:', result.warnings);
});
