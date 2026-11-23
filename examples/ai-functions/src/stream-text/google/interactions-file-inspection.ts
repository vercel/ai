import { google, type GoogleInteractionsFileOptions } from '@ai-sdk/google';
import { isStepCount, streamText, tool, uploadFile } from 'ai';
import fs from 'node:fs';
import { z } from 'zod/v4';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference } = await uploadFile({
    api: google,
    data: fs.readFileSync('./data/ai.pdf'),
    mediaType: 'application/pdf',
  });

  const result = streamText({
    model: google.interactions('gemini-4-hydrogen'),
    prompt: 'Use viewFile to read the first two pages, then summarize them.',
    stopWhen: isStepCount(5),
    tools: {
      viewFile: tool({
        description:
          'Read an inclusive range of pages from the PDF. Pages start at 1.',
        inputSchema: z.object({
          startPage: z.number().int().positive(),
          endPage: z.number().int().positive(),
        }),
        execute: async input => input,
        toModelOutput: ({ output }) => ({
          type: 'content',
          value: [
            {
              type: 'file',
              data: { type: 'reference', reference: providerReference },
              mediaType: 'application/pdf',
              providerOptions: {
                google: {
                  processing: {
                    type: 'static',
                    pageOptions: { ...output, contentLayers: ['page_text'] },
                  },
                } satisfies GoogleInteractionsFileOptions,
              },
            },
          ],
        }),
      }),
    },
  });
  await printFullStream({ result });
});
