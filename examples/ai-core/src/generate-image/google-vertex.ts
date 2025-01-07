import 'dotenv/config';
import { vertex } from '@ai-sdk/google-vertex';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

async function main() {
  const { image } = await generateImage({
    model: vertex.image('imagen-3.0-generate-001'),
    prompt: 'A burrito launched through a tunnel',
    aspectRatio: '1:1',
    seed: 'random',
    providerOptions: {
      vertex: {
        // https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/imagen-api#parameter_list
        addWatermark: false,
      },
    },
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
