import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    prompt: 'What is 2 + 2? Reply with just the number.',
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Usage:');
  console.log('  Input tokens:', result.usage.inputTokens);
  console.log('  Output tokens:', result.usage.outputTokens);
  console.log();
  console.log('Output token details:');
  console.log('  textTokens:', result.usage.outputTokenDetails?.textTokens);
  console.log(
    '  reasoningTokens:',
    result.usage.outputTokenDetails?.reasoningTokens,
  );
  console.log();

  if (result.usage.outputTokenDetails?.textTokens === undefined) {
    console.log(
      'BUG: textTokens is undefined but should be',
      result.usage.outputTokens,
    );
  } else {
    console.log('OK: textTokens is correctly populated');
  }
});
