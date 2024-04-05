import { experimental_generateText } from 'ai';
import { anthropic } from 'ai/anthropic';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

async function main() {
  const result = await experimental_generateText({
    model: anthropic.messages('claude-3-haiku-20240307'),
    maxTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
