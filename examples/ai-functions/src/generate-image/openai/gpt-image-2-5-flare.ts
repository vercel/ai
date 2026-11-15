import { openai } from '@ai-sdk/openai';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: openai.image('gpt-image-2.5-flare'),
    prompt: 'A tiny glass terrarium city glowing on a rainy windowsill',
  });

  await presentImages([image]);
});
