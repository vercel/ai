import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: amazonBedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the pdf in detail.' },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
          },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
