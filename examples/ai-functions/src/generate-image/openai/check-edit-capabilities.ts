import { openai } from '@ai-sdk/openai';
import { prodia } from '@ai-sdk/prodia';
import type { ImageModelV4 } from '@ai-sdk/provider';

const candidates: Array<{ name: string; model: ImageModelV4 }> = [
  { name: 'OpenAI GPT Image', model: openai.image('gpt-image-1') },
  { name: 'OpenAI DALL-E 3', model: openai.image('dall-e-3') },
  {
    name: 'Prodia Flux Schnell',
    model: prodia.image('inference.flux-fast.schnell.txt2img.v2'),
  },
];

for (const { name, model } of candidates) {
  const supportsFiles = await model.supportsFileInputs;
  const supportsMasks = await model.supportsMaskInputs;

  console.log(name, {
    supportsFiles: supportsFiles ?? 'unknown',
    supportsMasks: supportsMasks ?? 'unknown',
  });
}

let selected: (typeof candidates)[number] | undefined;

for (const candidate of candidates) {
  if ((await candidate.model.supportsFileInputs) === true) {
    selected = candidate;
    break;
  }
}

if (selected == null) {
  throw new Error('No model advertises image editing support.');
}

console.log(`Selected ${selected.name} for an image editing request.`);
