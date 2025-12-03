import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'what is the sum of the first 10 prime numbers?',
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingBudget: 2048,
          // includeThoughts: true,
        },
      },
    },
  });

  console.log('=== REASONING (thoughts) ===');
  if (result.reasoning) {
    console.log(result.reasoning);
  } else {
    console.log('(no reasoning returned)');
  }

  console.log('\n=== TEXT (final answer) ===');
  console.log(result.text);

  console.log('\n=== USAGE ===');
  console.log('Input tokens:', result.usage.inputTokens);
  console.log('Output tokens:', result.usage.outputTokens);
  console.log('Reasoning tokens:', result.usage.reasoningTokens || 0);
  console.log('Total tokens:', result.usage.totalTokens);
}

main().catch(console.error);
