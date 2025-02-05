import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = streamText({
    model: bedrock(
      `arn:aws:bedrock:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:inference-profile/us.anthropic.claude-3-5-sonnet-20240620-v1:0`,
    ),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the pdf in detail.' },
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
