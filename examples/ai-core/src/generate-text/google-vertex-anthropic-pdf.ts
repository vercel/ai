import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';
import fs from 'node:fs';

async function main() {
  const result = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
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
            mimeType: 'application/pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
}

main().catch(console.error);
