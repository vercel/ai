import 'dotenv/config';
import { googleVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { streamText } from 'ai';
import fs from 'node:fs';

async function main() {
  const result = streamText({
    model: googleVertexAnthropic('claude-3-5-sonnet@20240620'),
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

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);
