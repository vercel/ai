import { anthropic } from '@ai-sdk/anthropic';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, providerMetadata } = await uploadFile({
    files: anthropic.files(),
    data: fs.readFileSync('./data/ai.pdf'),
    filename: 'ai.pdf',
  });

  console.log('Provider reference:', providerReference);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: anthropic('claude-sonnet-4-0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Summarize the key points from this document.',
          },
          {
            type: 'file',
            data: providerReference,
            mediaType: 'application/pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
