import { generateText } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

async function main() {
  const result = await generateText({
    model: openai.chat({
      id: 'gpt-4-vision-preview',
      maxTokens: 512,
    }),

    prompt: {
      instruction: [
        { type: 'text', text: 'Describe the image in detail.' },
        { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
      ],
    },
  });

  console.log(result.text);
}

main();
