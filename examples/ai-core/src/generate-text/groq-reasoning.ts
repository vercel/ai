import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: groq('qwen-qwq-32b'),
    providerOptions: {
      groq: { reasoningFormat: 'parsed' },
    },
    prompt: 'How many "r"s are in the word "strawberry"?',
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
