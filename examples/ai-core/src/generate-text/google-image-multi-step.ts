import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const step1 = await generateText({
    model: google('gemini-3-pro-image-preview'),
    prompt:
      'Create an image of Los Angeles where all car infrastructure has been replaced with bike infrastructure, trains, pedestrian zones, and parks. The image should be photorealistic and vibrant.',
  });

  await presentImages(step1.files);

  const step2 = await generateText({
    model: google('gemini-3-pro-image-preview'),
    messages: [
      ...step1.response.messages,
      {
        role: 'user',
        content:
          'Now create a variation of the image, but in the style of a watercolor painting.',
      },
    ],
  });

  await presentImages(step2.files);
}

main().catch(console.error);
