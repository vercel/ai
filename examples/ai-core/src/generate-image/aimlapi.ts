import 'dotenv/config';
import { aimlapi } from '@ai-ml.api/aimlapi-vercel-ai';

async function main() {
  const model = aimlapi.imageModel('flux-pro');

  const res = await model.doGenerate({
    prompt: 'a red balloon floating over snowy mountains, cinematic',
    n: 1,
    aspectRatio: '16:9',
    seed: 42,
    size: '1024x768',
    providerOptions: {},
  });

  console.log(`\u2705 Generated image url: ${res.images[0]}`);
}

main().catch(console.error);
