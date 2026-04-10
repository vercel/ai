import { google } from '@ai-sdk/google';
import { generateImage } from 'ai';
import { run } from '../../lib/run';
import { presentImages } from '../../lib/present-image';

run(async () => {
  const result = await generateImage({
    model: google.image('gemini-2.5-flash-image'),
    prompt:
      'Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme',
  });

  presentImages(result.images);

  console.log();
  console.log('token usage:', result.usage);
});
