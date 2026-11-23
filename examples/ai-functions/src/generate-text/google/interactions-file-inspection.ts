import { google, type GoogleInteractionsFileOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google.interactions('gemini-4-hydrogen'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: fs.readFileSync('./data/aisdk.xlsx'),
            mediaType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            providerOptions: {
              google: {
                processing: {
                  type: 'static',
                  spreadsheetOptions: {
                    sheetIndex: 1,
                    visibleCells: 'A1:C5',
                    contentLayers: ['data', 'formulas'],
                  },
                },
              } satisfies GoogleInteractionsFileOptions,
            },
          },
          {
            type: 'text',
            text: 'Describe these cells and explain any formulas.',
          },
        ],
      },
    ],
  });
  console.log(result.text);
  console.log('Token usage:', result.usage);
});
