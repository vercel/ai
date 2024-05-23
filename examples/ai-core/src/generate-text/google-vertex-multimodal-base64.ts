import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

async function main() {
  const result = await generateText({
    model: vertex('gemini-1.0-pro-vision'),
    maxTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image: fs.readFileSync('./data/comic-cat.png').toString('base64'),
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
