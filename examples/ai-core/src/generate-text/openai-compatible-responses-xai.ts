import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

async function main() {
  const xai = createOpenAICompatible({
    baseURL: 'https://api.x.ai/v1',
    name: 'xai',
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
  });

  const result = await generateText({
    model: xai.responsesModel('grok-2-1212'),
    system: 'You are a helpful assistant.',
    prompt: 'Write a haiku about programming.',
    maxOutputTokens: 100,
  });

  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
}

main().catch(console.error);
