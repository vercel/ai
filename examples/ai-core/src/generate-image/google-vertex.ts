import {
  GoogleVertexImageProviderOptions,
  vertex,
} from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import { run } from '../lib/run';

run(async () => {
  const result = await generateImage({
    model: vertex.image('imagen-4.0-generate-001'),
    prompt: 'A burrito launched through a tunnel',
    aspectRatio: '1:1',
    providerOptions: {
      vertex: {
        addWatermark: false,
      } satisfies GoogleVertexImageProviderOptions,
    },
  });

  await presentImages(result.images);

  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
});
