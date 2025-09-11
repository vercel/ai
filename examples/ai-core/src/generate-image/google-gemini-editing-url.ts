import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import 'dotenv/config';

async function editImage() {
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
            type: 'image',
            image: new URL(
              'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-core/data/comic-cat.png',
            ),
            mediaType: 'image/jpeg',
          },
        ],
      },
    ],
  });

  // Save the edited image
  const timestamp = Date.now();
  fs.mkdirSync('output', { recursive: true });

  for (const file of editResult.files) {
    if (file.mediaType.startsWith('image/')) {
      await fs.promises.writeFile(
        `output/edited-${timestamp}.png`,
        file.uint8Array,
      );
      console.log(`Saved edited image: output/edited-${timestamp}.png`);
    }
  }
}

editImage().catch(console.error);
