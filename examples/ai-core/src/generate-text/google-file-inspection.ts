import { google, type GoogleFilePartOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-4-carbon'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            providerOptions: {
              google: {
                documentMetadata: {
                  startPage: 1,
                  endPage: 1,
                  contentLayers: ['PAGE_TEXT'],
                },
              } satisfies GoogleFilePartOptions,
            },
          },
          { type: 'text', text: 'Summarize the selected page.' },
        ],
      },
    ],
  });
  console.log(result.text);
});
