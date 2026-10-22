import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, uploadFile } from 'ai';
import { readFile } from 'node:fs/promises';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference } = await uploadFile({
    api: openai.files(),
    data: await readFile('./data/ai.pdf'),
    filename: 'ai.pdf',
    providerOptions: { openai: { purpose: 'user_data' } },
  });

  const provider = createOpenAICompatible({
    baseURL: 'https://api.openai.com/v1',
    // Match the provider key in the uploaded file reference.
    name: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
  });

  const result = streamText({
    model: provider('gpt-6-luna'),
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
            mediaType: 'application/pdf',
            data: { type: 'reference', reference: providerReference },
          },
        ],
      },
    ],
  });

  await printFullStream({ result });
});
