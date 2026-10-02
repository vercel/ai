import { minimax } from '@ai-sdk/minimax';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const prompt = 'A beautiful sunset over the ocean with golden clouds';
  const result = await generateImage({
    model: minimax.image('image-01'),
    prompt,
    n: 1,
    providerOptions: {
      minimax: {
        aspect_ratio: '16:9',
      },
    },
  });

  await presentImages(result.images);

  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
});
