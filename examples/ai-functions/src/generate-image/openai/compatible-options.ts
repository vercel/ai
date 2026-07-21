import {
  createOpenAICompatible,
  type OpenAICompatibleImageModelOptions,
} from '@ai-sdk/openai-compatible';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

const provider = createOpenAICompatible({
  name: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

run(async () => {
  const { images } = await generateImage({
    model: provider.imageModel('gpt-image-2'),
    prompt: 'A luminous glass greenhouse floating over a forest at dawn',
    size: '1024x1024',
    providerOptions: {
      openai: {
        quality: 'low',
      } satisfies OpenAICompatibleImageModelOptions,
    },
  });

  await presentImages(images);
});
