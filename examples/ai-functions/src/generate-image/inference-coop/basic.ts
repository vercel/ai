import { inferenceCoop } from '@ai-sdk/inference-coop';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateImage({
    model: inferenceCoop.image('regolo/qwen-image'),
    prompt: 'A delighted resplendent quetzal mid flight amidst raindrops',
    size: '512x512',
  });

  await presentImages(result.images);
});
