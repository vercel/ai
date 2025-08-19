import { huggingface } from '@ai-sdk/huggingface';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: huggingface('deepseek-ai/DeepSeek-R1'),
    messages: [
      {
        role: 'user',
        content: 'What is 5 + 7?',
      },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'I need to add 5 and 7 together.' },
          { type: 'text', text: '5 + 7 = 12' },
        ],
      },
      {
        role: 'user',
        content: 'What is 12 × 3?',
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log('\nToken usage:', await result.usage);
}

main().catch(console.error);
