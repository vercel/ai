import { experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';
import { myImageModels } from './setup-registry';

async function main() {
  const { image } = await generateImage({
    model: myImageModels.imageModel('flux'),
    prompt: 'The Loch Ness Monster getting a manicure',
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
}

main().catch(console.error);
