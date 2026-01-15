import { generateImage } from 'ai';
import fs from 'node:fs';
import { myImageModels } from './setup-registry';
import { run } from '../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: myImageModels.imageModel('flux'),
    prompt: 'The Loch Ness Monster getting a manicure',
  });

  const filename = `image-${Date.now()}.png`;
  fs.writeFileSync(filename, image.uint8Array);
  console.log(`Image saved to ${filename}`);
});
