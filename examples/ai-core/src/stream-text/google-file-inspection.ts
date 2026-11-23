import { google, type GoogleFilePartOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';
import { printFullStream } from '../lib/print-full-stream';

run(async () => {
  const result = streamText({
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
  await printFullStream({ result });
});
