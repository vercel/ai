import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-5'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log(JSON.stringify(result.request.body, null, 2));
  console.log(JSON.stringify(result.content, null, 2));
}

main().catch(console.error);
