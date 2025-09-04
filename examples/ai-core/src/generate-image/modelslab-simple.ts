import { modelslab } from '@ai-sdk/modelslab';
import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';

async function main() {
  console.log('Generating image with ModelsLab...\n');

  const { images } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
  });

  console.log(`Generated ${images.length} images`);

  // Simple output without terminal display
  for (let i = 0; i < images.length; i++) {
    console.log(`Image ${i + 1}: ${images[i].uint8Array.length} bytes`);
  }
}

main().catch(console.error);
