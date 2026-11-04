import { googleVertex } from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateImage({
    model: googleVertex.image('gemini-3.1-flash-image-preview'),
    prompt:
      'Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme',
    aspectRatio: '1:1',
  });

  presentImages(result.images);

  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
  console.log('Token usage:', result.usage);
});
