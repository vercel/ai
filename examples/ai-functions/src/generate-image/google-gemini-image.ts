import { google } from '@ai-sdk/google';
import { generateImage } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const result = await generateImage({
    model: google.image('gemini-2.5-flash-image'),
    prompt:
      'Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme',
  });

  fs.mkdirSync('output', { recursive: true });

  for (const image of result.images) {
    const timestamp = Date.now();
    const fileName = `nano-banana-${timestamp}.png`;

    await fs.promises.writeFile(`output/${fileName}`, image.uint8Array);

    console.log(`Generated and saved image: output/${fileName}`);
  }

  console.log();
  console.log('token usage:', result.usage);
});
