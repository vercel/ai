import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-haiku-20240307'),
    maxTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
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
