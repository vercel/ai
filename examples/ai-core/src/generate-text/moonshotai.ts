import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const moonshotai = createOpenAICompatible({
    baseURL: 'https://api.moonshot.ai/v1',
    apiKey: process.env.MOONSHOTAI_API_KEY,
    name: 'moonshotai',
  });
  const { text, usage } = await generateText({
    model: moonshotai('kimi-k2-0711-preview'),
    prompt:
      "Tell me what's notable about Oaxacan food. Reply in only a few sentences.",
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);
