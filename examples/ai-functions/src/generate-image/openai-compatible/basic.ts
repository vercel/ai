import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

// Any OpenAI-compatible image endpoint works here. Point baseURL at your
// provider (LM Studio, NIM, Clarifai, Heroku, NEAR AI, ...) and set the
// matching API key.
const compatible = createOpenAICompatible({
  name: 'openai-compatible',
  baseURL:
    process.env.OPENAI_COMPATIBLE_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.OPENAI_API_KEY,
});

run(async () => {
  const prompt = 'A blue cream Persian cat in Kyoto in the style of ukiyo-e';

  const result = await generateImage({
    model: compatible.imageModel(
      process.env.OPENAI_COMPATIBLE_IMAGE_MODEL ?? 'gpt-image-1',
    ),
    prompt,
  });

  await presentImages(result.images);

  // `undefined` when the backend does not report usage — many OpenAI-compatible
  // image endpoints omit it, which is not an error.
  console.log('Token usage:', result.usage);
});
