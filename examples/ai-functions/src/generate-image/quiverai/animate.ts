import { quiverai, type QuiverAIImageModelOptions } from '@ai-sdk/quiverai';
import { generateImage } from 'ai';
import fs from 'node:fs/promises';
import { run } from '../../lib/run';

const sourceSvg = new TextEncoder().encode(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <circle cx="64" cy="64" r="40" fill="#7c3aed" />
  </svg>
`);

run(async () => {
  const { image, providerMetadata } = await generateImage({
    model: quiverai.image('arrow-2'),
    prompt: {
      images: [sourceSvg],
      text: 'Make the circle pulse gently.',
    },
    providerOptions: {
      quiverai: {
        operation: 'animate',
        reasoningEffort: 'medium',
        maxOutputTokens: 4096,
      } satisfies QuiverAIImageModelOptions,
    },
  });

  await fs.mkdir('output', { recursive: true });
  await fs.writeFile('output/quiverai-animation.svg', image.uint8Array);

  const metadata = providerMetadata.quiverai?.images?.[0];
  console.log('Saved animated SVG to output/quiverai-animation.svg');
  console.log('Animation timing:', metadata);
});
