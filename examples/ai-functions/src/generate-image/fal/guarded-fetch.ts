import { createFal } from '@ai-sdk/fal';
import { createGuardedFetch } from '@ai-sdk/guarded-fetch';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  // Reuse one transport for the provider API and its response URL downloads.
  const fetch = createGuardedFetch();
  const fal = createFal({ fetch });

  try {
    const { images } = await generateImage({
      model: fal.image('fal-ai/flux/schnell'),
      prompt: 'A blue cream Persian cat in Kyoto in the style of ukiyo-e',
    });
    await presentImages(images);
  } finally {
    await fetch.close();
  }
});
