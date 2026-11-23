import { google, type GoogleFilePartOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

// Requires a project with Extended Multimodal File Inspection EAP access.
run(async () => {
  const result = await generateText({
    model: google('gemini-4-argon-file-processing-eap'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: fs.readFileSync('./data/sdk.docx'),
            mediaType:
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
          {
            type: 'text',
            text: 'Summarize the first page of this Word document.',
          },
        ],
      },
    ],
  });
  console.log(result.text);
  console.log('Token usage:', result.usage);
});
