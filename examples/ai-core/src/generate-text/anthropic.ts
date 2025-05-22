import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-4-opus-20250514'),
    prompt: 'How are you?',
  });

  console.log(result.text);
  console.log(result.reasoning);
  console.log(result.reasoningDetails);
}

main().catch(console.error);
