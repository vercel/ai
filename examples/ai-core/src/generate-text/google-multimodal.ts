import { experimental_generateText } from 'ai';
import { google } from 'ai/google';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

async function main() {
  const result = await experimental_generateText({
    model: google.generativeAI('models/gemini-pro-vision'),
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
