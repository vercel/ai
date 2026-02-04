import { google } from '@ai-sdk/google';
import { generateImage } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { images } = await generateImage({
    model: google.image('gemini-2.5-flash-image'),
    prompt: 'A nano banana in a fancy restaurant',
  });

  console.log(`Generated ${images.length} image(s)`);
});
