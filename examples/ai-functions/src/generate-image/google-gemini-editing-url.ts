import { google } from '@ai-sdk/google';
import { generateImage } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const editResult = await generateImage({
    model: google.image('gemini-2.5-flash-image'),
    prompt: {
      text: 'Add a small wizard hat to this cat. Keep everything else the same.',
      images: [
        'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png',
      ],
    },
  });

  const timestamp = Date.now();
  fs.mkdirSync('output', { recursive: true });

  for (const image of editResult.images) {
    await fs.promises.writeFile(
      `output/edited-${timestamp}.png`,
      image.uint8Array,
    );
    console.log(`Saved edited image: output/edited-${timestamp}.png`);
  }
});
