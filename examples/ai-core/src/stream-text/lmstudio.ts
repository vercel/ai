import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

const lmstudio = createOpenAI({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
});

async function main() {
  const result = streamText({
    model: lmstudio('bartowski/gemma-2-9b-it-GGUF'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 1,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
