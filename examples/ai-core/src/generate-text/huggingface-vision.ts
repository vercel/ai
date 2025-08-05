import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: huggingface('Qwen/Qwen2.5-VL-7B-Instruct'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe what you see in this image.',
          },
          {
            type: 'image',
            image: new URL(
              'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
            ),
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
