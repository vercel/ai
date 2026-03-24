import { openai, type OpenAIFilesOptions } from '@ai-sdk/openai';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, providerMetadata } = await uploadFile({
    files: openai.files(),
    data: fs.readFileSync('./data/ai.pdf'),
    filename: 'ai.pdf',
    providerOptions: {
      openai: {
        purpose: 'assistants',
      } satisfies OpenAIFilesOptions,
    },
  });

  console.log('Provider reference:', providerReference);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: openai.responses('gpt-4o-mini'),
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
