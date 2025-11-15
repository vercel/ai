import { createBlackForestLabs } from '@ai-sdk/black-forest-labs';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

const blackForestLabs = createBlackForestLabs({
  fetch: async (...args) => {
    console.log('Fetching:', ...args);
    const response = await fetch(...args);
    const responseBody = await response.clone().text();
    try {
      const body = JSON.parse(responseBody);
      console.log('Response body:', body);
    } catch {
      console.log('non-json response');
    }
    return response;
  },
});

run(async () => {
  const response = await generateImage({
    model: blackForestLabs.image('flux-pro-1.1'),
    n: 2,
    prompt:
      'A cat wearing an intricate robe while gesticulating wildly, in the style of 80s pop art',
    aspectRatio: '1:1',
  });
  await presentImages(response.images);

  console.log('response.providerMetadata', response.providerMetadata);
});
