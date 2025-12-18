import {
  GoogleVertexImageProviderOptions,
  vertex,
} from '@ai-sdk/google-vertex';
import { generateImage } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
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
}

main().catch(console.error);
