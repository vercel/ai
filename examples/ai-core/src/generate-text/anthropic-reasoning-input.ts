import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, generateText } from 'ai';
import 'dotenv/config';

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

async function main() {
  const result = await generateText({
    model: anthropic('research-claude-flannel'),
    messages: [
      {
        role: 'user',
        content: 'How many "r"s are in the word "strawberry"?',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'I need to count the number of "r"s in the word "strawberry".',
          },
          {
            type: 'text',
            text: 'The word "strawberry" has 3 "r"s.',
          },
        ],
      },
      {
        role: 'user',
        content: 'How many "o"s are in the word "xylophone"?',
      },
    ] satisfies CoreMessage[],
    temperature: 0.5, // should get ignored (warning)
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
