import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash-image'),
    prompt:
      'Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme',
  });

  for (const file of result.files) {
    if (file.mediaType.startsWith('image/')) {
      const timestamp = Date.now();
      const fileName = `nano-banana-${timestamp}.png`;

      fs.mkdirSync('output', { recursive: true });
      await fs.promises.writeFile(`output/${fileName}`, file.uint8Array);

      console.log(`Generated and saved image: output/${fileName}`);
    }
  }

  console.log();
  console.log('token usage:', result.usage);
  console.log('finish reason:', result.finishReason);
});
