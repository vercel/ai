import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

async function main() {
  const huggingface = createOpenAICompatible({
    baseURL: 'https://router.huggingface.co/v1',
    name: 'huggingface',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
    },
  });

  const result = await generateText({
    model: huggingface.responsesModel('moonshotai/Kimi-K2-Instruct'),
    system: 'You are a helpful assistant.',
    prompt: 'Tell me a three sentence bedtime story about a unicorn.',
    maxOutputTokens: 200,
  });

  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
}

main().catch(console.error);
