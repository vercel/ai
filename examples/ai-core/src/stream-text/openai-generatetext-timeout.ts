import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  try {
    const result = await generateText({
      model: openai('gpt-3.5-turbo'),
      prompt: 'Write a short story about a robot learning to love:\n\n',
      timeout: 100, // Change this value to see different results
    });
    process.stdout.write(result.text);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      console.log('\n\nAbortError: The run was aborted.');
    }
  }
}

main().catch(console.error);
