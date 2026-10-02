import { minimax } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const prompt = 'A futuristic cityscape at night with neon lights';

  const urlResult = await generateImage({
    model: minimax.image('image-01'),
    prompt,
    n: 1,
    providerOptions: {
      minimax: {
        response_format: 'url',
      },
    },
  });

  console.log('URL format images:', urlResult.images);

  const base64Result = await generateImage({
    model: minimax.image('image-01'),
    prompt,
    n: 1,
    providerOptions: {
      minimax: {
        response_format: 'base64',
      },
    },
  });

  console.log('Base64 format images:', base64Result.images);
  console.log('Base64 image length:', base64Result.images[0].length);

  await presentImages(urlResult.images);
});
