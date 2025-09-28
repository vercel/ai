import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
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

  console.log('Response:');
  console.log(result.text);
  console.log('\nToken usage:', result.usage);
}

main().catch(console.error);
