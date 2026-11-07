import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('global.anthropic.claude-sonnet-5-5'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'How many documents are attached?',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            filename: 'ai.pdf',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            filename: 'ai.pdf',
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
