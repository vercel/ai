import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: createOpenAICompatible({
      baseURL: 'https://api.x.ai/v1',
      name: 'xai',
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
    }).responsesModel('grok-4-fast-reasoning'),
    maxOutputTokens: 100,
    system: 'You are a helpful assistant.',
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
  console.log();
  console.log((await result.request).body);
}

main().catch(console.error);
