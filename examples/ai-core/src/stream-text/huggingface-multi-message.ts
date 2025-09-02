import { huggingface } from '@ai-sdk/huggingface';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: huggingface('meta-llama/Llama-3.1-8B-Instruct'),
    messages: [
      {
        role: 'user',
        content: 'I need help with a coding problem.',
      },
      {
        role: 'assistant',
        content: 'I would be happy to help you with your coding problem! What programming language are you working with and what specific issue are you facing?',
      },
      {
        role: 'user',
        content: 'I am working with TypeScript and need to create a function that validates email addresses.',
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
}

main().catch(console.error);
