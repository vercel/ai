import { huggingface } from '@ai-sdk/huggingface';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: huggingface('Qwen/Qwen2.5-VL-32B-Instruct'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this image and describe what you see in detail.' },
          {
            type: 'image',
            image: 'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
          },
        ],
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
