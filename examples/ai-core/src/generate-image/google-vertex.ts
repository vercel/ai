import 'dotenv/config';
import { vertex } from '@ai-sdk/google-vertex';
import { experimental_generateImage as generateImage } from 'ai';
import fs from 'fs';

async function main() {
  const { image } = await generateImage({
    model: vertex.image('imagen-3.0-generate-001'),
    prompt: 'A burrito launched through a tunnel',
    providerOptions: {
      vertex: {
        aspectRatio: '16:9',
      },
    },
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
