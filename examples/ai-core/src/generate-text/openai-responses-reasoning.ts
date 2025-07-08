import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('o3-mini'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    temperature: 0.5, // should get ignored (warning)
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  process.stdout.write('\x1b[34m');
  console.log(JSON.stringify(result.reasoning, null, 2));
  process.stdout.write('\x1b[0m');
  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
  console.log();
  console.log('Request:', JSON.stringify(result.request, null, 2));
  console.log('Response:', JSON.stringify(result.response, null, 2));
}

main().catch(console.error);
