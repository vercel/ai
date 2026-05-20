import { quiverai, type QuiverAIImageModelOptions } from '@ai-sdk/quiverai';
import { generateImage } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../../lib/run';

const OUTPUT_DIR = 'output';

run(async () => {
  const { image } = await generateImage({
    model: quiverai.image('arrow-1.1'),
    prompt: {
      images: ['https://example.com/logo.png'],
    },
    providerOptions: {
      quiverai: {
        operation: 'vectorize',
        autoCrop: true,
        targetSize: 1024,
      } satisfies QuiverAIImageModelOptions,
    },
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filePath = path.join(
    OUTPUT_DIR,
    `quiverai-vectorize-${Date.now()}.svg`,
  );
  await fs.promises.writeFile(filePath, image.uint8Array);

  console.log(`Saved SVG to ${filePath}`);
});
