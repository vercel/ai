import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-20240620'),

    headers: { 'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15' },
    maxTokens: 8192, // important: specify max tokens

    system:
      "Don't shy away from generating long text. Follow the user's instructions'",
    prompt:
      'Invent a new holiday and describe its traditions. Write at least 20 pages.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
