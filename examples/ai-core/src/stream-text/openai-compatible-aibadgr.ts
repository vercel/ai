import 'dotenv/config';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

async function main() {
  const aibadgr = createOpenAICompatible({
    baseURL: process.env.AIBADGR_BASE_URL ?? 'https://aibadgr.com/api/v1',
    name: 'aibadgr',
    headers: {
      Authorization: `Bearer ${process.env.AIBADGR_API_KEY}`,
    },
  });
  const model = aibadgr.chatModel('premium');
  const result = streamText({
    model,
    prompt: 'Write a short story about AI.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
