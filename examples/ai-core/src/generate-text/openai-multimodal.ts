import { experimental_generateText } from 'ai';
import { OpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const result = await experimental_generateText({
    model: openai.chat('gpt-4-vision-preview'),
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
