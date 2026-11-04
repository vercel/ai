import { google } from '@ai-sdk/google';
import { generateImage } from 'ai';
import { run } from '../../lib/run';
import { presentImages } from '../../lib/present-image';

run(async () => {
  const { images } = await generateImage({
    model: google.image('gemini-3.1-flash-image-preview'),
    prompt: 'A nano banana in a fancy restaurant',
  });

  presentImages(images);
});
