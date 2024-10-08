import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const { object: summary } = await generateObject({
    model: google('gemini-1.5-pro-latest'),
    schema: z.object({
      title: z.string(),
      authors: z.array(z.string()),
      keyPoints: z.array(z.string()),
    }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract title, authors, and key points from the PDF.',
          },
          {
            type: 'file',
            data:
              'https://user.phil.hhu.de/~cwurm/wp-content/uploads/' +
              '2020/01/7181-attention-is-all-you-need.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    ],
  });

  console.log(summary);
}

main().catch(console.error);
