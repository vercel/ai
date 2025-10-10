import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import 'dotenv/config';

async function main() {
  const openai = createOpenAICompatible({
    baseURL: 'https://api.openai.com/v1',
    name: 'openai',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  const model = openai.chatModel('gpt-5-mini');

  const result = await generateText({
    model: model,
    prompt: 'Explain the theory of relativity in simple terms.',
    providerOptions: {
      openai: {
        textVerbosity: 'low',
        reasoningEffort: 'low',
      },
    },
  });
  console.log(result.text);
  console.log(result.request.body)
}

main().catch(console.error);
