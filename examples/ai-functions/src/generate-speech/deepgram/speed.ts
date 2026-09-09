import { deepgram } from '@ai-sdk/deepgram';
import { generateSpeech } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../../lib/run';

// Validates Deepgram's `speed` query parameter: the same text rendered at
// 0.7x, 1x, and 1.5x. Compare the saved files' pace and durations.
// Note: Deepgram rejects speeds outside 0.7–1.5 with a 400.
run(async () => {
  fs.mkdirSync('output', { recursive: true });

  for (const speed of [0.7, 1, 1.5]) {
    const result = await generateSpeech({
      model: deepgram.speech('aura-2'),
      voice: 'helena',
      speed,
      text: 'The quick brown fox jumps over the lazy dog.',
    });

    console.log(`Speed ${speed}:`);
    console.log('  Warnings:', result.warnings);
    console.log('  Provider Metadata:', result.providerMetadata);
    console.log('  Audio bytes:', result.audio.uint8Array.length);

    const filePath = path.join('output', `audio-speed-${speed}.mp3`);
    await fs.promises.writeFile(filePath, result.audio.uint8Array);
    console.log(`  Saved audio to ${filePath}`);
  }
});
