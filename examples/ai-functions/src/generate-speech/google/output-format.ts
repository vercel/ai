import { google } from '@ai-sdk/google';
import { generateSpeech } from 'ai';
import { writeFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateSpeech({
    model: google.speech('gemini-3.8-flash-tts'),
    text: 'Hello from the AI SDK!',
    outputFormat: 'audio/mulaw', // Also supports audio/l16 and audio/alaw.
  });

  console.log('Media type:', result.audio.mediaType);
  console.log('Audio metadata:', result.providerMetadata.google);
  await writeFile('output.mulaw', result.audio.uint8Array);
});
