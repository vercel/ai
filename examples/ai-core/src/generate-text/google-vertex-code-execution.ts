import { vertex } from '@ai-sdk/google-vertex';
import { googleTools } from '@ai-sdk/google/internal';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: vertex('gemini-2.5-pro'),
    tools: { code_execution: googleTools.codeExecution({}) },
    maxOutputTokens: 2048,
    prompt:
      'Use python to calculate 20th fibonacci number. Then find the nearest palindrome to it.',
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
