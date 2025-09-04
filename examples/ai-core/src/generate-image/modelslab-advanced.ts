import { modelslab } from '@ai-sdk/modelslab';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  console.log('Generating image with ModelsLab...\n');

  const { images } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt:
      'A majestic golden dragon soaring through a mystical forest at sunset, detailed fantasy art style',
    size: '768x768',
    n: 2, // Generate 2 images
    providerOptions: {
      modelslab: {
        negativePrompt: 'blurry, low quality, distorted, ugly',
        safetyChecker: true,
        seed: 42, // Use a fixed seed for reproducible results
      },
    },
  });

  console.log(`Generated ${images.length} images`);
  await presentImages(images);
}

main().catch(console.error);
