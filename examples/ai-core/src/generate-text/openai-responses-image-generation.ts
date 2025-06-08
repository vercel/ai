import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';
import { presentImages } from '../lib/present-image';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-4.1'),
    prompt: 'A beautiful sunset over a calm ocean',
    tools: {
      image_generation: openai.tools.imageGeneration(),
    },
  });

  await presentImages([result.files[0]]);
  console.log(result.text);
}

main().catch(console.error);
