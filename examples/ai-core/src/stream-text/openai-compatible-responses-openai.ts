import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

async function main() {
  const openai = createOpenAICompatible({
    baseURL: 'https://api.openai.com/v1',
    name: 'openai',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  const result = streamText({
    model: openai.responsesModel('gpt-4o-mini'),
    system: 'You are a helpful assistant.',
    prompt: 'Invent a new holiday and describe its traditions.',
    maxOutputTokens: 500,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
