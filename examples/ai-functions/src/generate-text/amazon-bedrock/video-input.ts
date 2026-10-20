import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.amazon.nova-pro-v1:0'),
    maxOutputTokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the video in detail.' },
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: fs.readFileSync('./data/prudence.mp4'),
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
