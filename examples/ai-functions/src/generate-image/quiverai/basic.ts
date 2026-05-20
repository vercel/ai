import { quiverai } from '@ai-sdk/quiverai';
import { generateImage } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../../lib/run';

const OUTPUT_DIR = 'output';

run(async () => {
  const { image } = await generateImage({
    model: quiverai.image('arrow-1.1'),
    prompt: 'A geometric logo for an AI design startup',
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(OUTPUT_DIR, `quiverai-${Date.now()}.svg`);
  await fs.promises.writeFile(filePath, image.uint8Array);

  console.log(`Saved SVG to ${filePath}`);
});
