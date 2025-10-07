import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = await generateText({
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

  console.log(result.text);
}

main().catch(console.error);
