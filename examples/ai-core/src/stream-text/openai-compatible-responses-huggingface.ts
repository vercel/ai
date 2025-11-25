import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

async function main() {
  const huggingface = createOpenAICompatible({
    baseURL: 'https://router.huggingface.co/v1',
    name: 'huggingface',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
    },
  });

  const result = streamText({
    model: huggingface.responsesModel('moonshotai/Kimi-K2-Instruct'),
    system: 'You are a helpful assistant.',
    prompt: 'Tell me a three sentence bedtime story about a unicorn.',
    maxOutputTokens: 200,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Finish reason:', await result.finishReason);
  console.log('Usage:', await result.usage);
}

main().catch(console.error);
