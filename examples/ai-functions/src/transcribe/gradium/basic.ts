import { gradium } from '@gradium/ai-sdk';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: gradium.transcription('default'),
    audio: await readFile(process.argv[2] ?? 'speech.wav'),
  });
  console.log('Text:', result.text);
  console.log('Segments:', result.segments);
  console.log('Provider metadata:', result.providerMetadata);
});
