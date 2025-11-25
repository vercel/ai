import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

async function main() {
  const openai = createOpenAICompatible({
    baseURL: 'https://api.openai.com/v1',
    name: 'openai',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  const result = await generateText({
    model: openai.responsesModel('gpt-4o-mini'),
    system: 'You are a helpful assistant.',
    prompt: 'Invent a new holiday and describe its traditions.',
    maxOutputTokens: 500,
  });

  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
}

main().catch(console.error);
