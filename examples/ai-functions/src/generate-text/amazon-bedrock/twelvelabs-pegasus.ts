import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.twelvelabs.pegasus-1-2-v1:0'),
    maxOutputTokens: 128,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this video in one sentence.' },
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
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Response headers:', result.response.headers);
});
