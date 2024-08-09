import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

async function main() {
  const result = await streamText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    maxTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the document in detail.' },
          {
            type: 'file',
            file: fs.readFileSync('./data/hamlet.pdf'),
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
