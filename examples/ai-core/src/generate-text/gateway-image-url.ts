import { gateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: gateway('xai/grok-3-beta'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image:
              'https://github.com/vercel/ai/blob/main/examples/ai-core/data/comic-cat.png?raw=true',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
