import { experimental_generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { z } from 'zod';

dotenv.config();

async function main() {
  const { object } = await experimental_generateObject({
    model: openai.chat('gpt-4-turbo'),
    schema: z.object({
      artwork: z.object({
        description: z.string(),
        style: z.string(),
        review: z.string(),
      }),
    }),
    system: 'You are an art critic reviewing a piece of art.',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail and review it' },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
  });

  console.log(JSON.stringify(object.artwork, null, 2));
}

main().catch(console.error);
