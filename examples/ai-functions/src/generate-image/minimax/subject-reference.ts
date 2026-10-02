import { minimax } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const prompt = 'A serene version of the reference image with soft lighting';

  const result = await generateImage({
    model: minimax.image('image-01'),
    prompt,
    n: 1,
    files: [
      {
        type: 'url',
        url: 'https://example.com/reference-image.jpg',
        mediaType: 'image/jpeg',
      },
    ],
    providerOptions: {
      minimax: {
        aspect_ratio: '1:1',
      },
    },
  });

  await presentImages(result.images);

  console.log('Generated images:', result.images.length);
  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
});
