import {
  prepareQuiverAIImageReference,
  quiverai,
  type QuiverAIImageModelOptions,
} from '@ai-sdk/quiverai';
import { generateImage } from 'ai';
import { run } from '../../lib/run';

const encoder = new TextEncoder();

run(async () => {
  const sourceSvg = encoder.encode(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="24" fill="#ef4444" />
      <path d="M40 64h48" stroke="white" stroke-width="12" />
    </svg>
  `);
  const referenceSvg = encoder.encode(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r="56" fill="#2563eb" />
    </svg>
  `);

  const { image, usage } = await generateImage({
    model: quiverai.image('arrow-2'),
    prompt: {
      text: 'Change the red background to match the blue reference image.',
      images: [sourceSvg],
    },
    providerOptions: {
      quiverai: {
        operation: 'edit',
        referenceImages: [prepareQuiverAIImageReference(referenceSvg)],
        maxReviewSteps: 1,
        reasoningEffort: 'low',
        maxOutputTokens: 4096,
        temperature: 0.2,
      } satisfies QuiverAIImageModelOptions,
    },
  });

  console.log(new TextDecoder().decode(image.uint8Array));
  console.log('Token usage:', usage);
});
