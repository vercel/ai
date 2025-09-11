import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import 'dotenv/config';

async function main() {
  console.log('Generating base cat image...');
  const baseResult = await generateText({
    model: google('gemini-2.5-flash-image-preview'),
    prompt:
      'A photorealistic picture of a fluffy ginger cat sitting on a wooden table',
  });

  let baseImageData: Uint8Array | null = null;
  const timestamp = Date.now();

  fs.mkdirSync('output', { recursive: true });

  for (const file of baseResult.files) {
    if (file.mediaType.startsWith('image/')) {
      baseImageData = file.uint8Array;
      await fs.promises.writeFile(
        `output/cat-base-${timestamp}.png`,
        file.uint8Array,
      );
      console.log(`Saved base image: output/cat-base-${timestamp}.png`);
      break;
    }
  }

  if (!baseImageData) {
    throw new Error('No base image generated');
  }

  console.log('Adding wizard hat...');
  const editResult = await generateText({
    model: google('gemini-2.5-flash-image-preview'),
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Add a small wizard hat to this cat. Keep everything else the same.',
          },
          {
            type: 'file',
            data: baseImageData,
            mediaType: 'image/png',
          },
        ],
      },
    ],
  });

  for (const file of editResult.files) {
    if (file.mediaType.startsWith('image/')) {
      await fs.promises.writeFile(
        `output/cat-wizard-${timestamp}.png`,
        file.uint8Array,
      );
      console.log(`Saved edited image: output/cat-wizard-${timestamp}.png`);
    }
  }
}

main().catch(console.error);
