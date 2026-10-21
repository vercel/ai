import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: minimax('minimax-m3.1-flash'),
    // Try 'minimal', 'low', 'medium', 'high', 'xhigh', or 'max'.
    // 'none' falls back to 'low' with a warning: Flash always reasons.
    reasoning: 'high',
    maxOutputTokens: 16384,
    prompt:
      'What is the smallest positive integer divisible by every integer from 1 to 10?',
  });

  console.log('Reasoning:', result.reasoningText);
  console.log('Answer:', result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Warnings:', result.warnings);
});
