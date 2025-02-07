import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

const openai = createOpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'abc',
});

async function main() {
  const result = streamText({
    model: openai('openai/gpt-4o-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onError: error => {
      console.error(error);
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
