import { huggingface } from '@ai-sdk/huggingface';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: huggingface('Qwen/Qwen2.5-VL-7B-Instruct'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What do you see in this image?' },
          {
            type: 'image',
            image:
              'https://github.com/vercel/ai/blob/main/examples/ai-functions/data/comic-cat.png?raw=true',
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
});
