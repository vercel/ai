import { generateText } from 'ai/core';
import { OpenAI } from 'ai/openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const result = await generateText({
    model: openai.chat('gpt-4-vision-preview'),
    maxTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image: new URL(
              'https://raw.githubusercontent.com/vercel/ai/v3.1-canary/examples/ai-core/data/comic-cat.png',
            ),
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main();
