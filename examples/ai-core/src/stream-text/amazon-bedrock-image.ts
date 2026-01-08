import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    maxOutputTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
