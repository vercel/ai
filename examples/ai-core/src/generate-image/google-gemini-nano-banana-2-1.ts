import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { presentImages } from '../lib/present-image';

run(async () => {
  const { files } = await generateText({
    model: google('gemini-nano-banana-2.1'),
    prompt: 'A nano banana in a fancy restaurant',
  });

  await presentImages(files.filter(file => file.mediaType.startsWith('image/')));
});
