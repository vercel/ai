import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = streamText({
    model: azure.responses('gpt-4.1-mini'), // please question about your documents.
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is an embedding model according to this document?',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            // filename: 'ai.pdf',
          },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
