import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import 'dotenv/config';

async function main() {
  const provider = createOpenAICompatible({
    name: 'provider',
    apiKey: process.env.PROVIDER_API_KEY,
    baseURL: process.env.PROVIDER_BASE_URL || '',
  });

  const model = provider('gpt-5-mini');

  const { text } = await generateText({
    model: model,
    prompt: 'Explain the theory of relativity in simple terms.',
    providerOptions: {
      provider: {
        textVerbosity: 'low',
        reasoningEffort: 'low',
      },
    },
  });
  console.log(text);
}

main().catch(console.error);
