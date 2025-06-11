import { openai, OpenAIProvider } from '@ai-sdk/openai';
import { GLOBAL_DEFAULT_PROVIDER, streamText } from 'ai';
import 'dotenv/config';

(globalThis as any)[GLOBAL_DEFAULT_PROVIDER] = openai;

declare global {
  interface GlobalThis {
    [GLOBAL_DEFAULT_PROVIDER]: OpenAIProvider;
  }
}

async function main() {
  const result = streamText({
    model: 'anthropic/claude-3.5-haiku',
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
