import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: google('gemini-3-flash-preview'),
    tools: {
      code_execution: google.tools.codeExecution({}),
    },
    prompt:
      'Calculate the sum of the first 50 prime numbers. ' +
      'Make sure to use the python tool. Show your work.',
  });

  console.log(result.text);
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
}

main().catch(console.error);
