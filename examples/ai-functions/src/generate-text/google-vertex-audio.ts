import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: vertex('gemini-1.5-flash'),
    providerOptions: {
      google: {
        audioTimestamp: true,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Output a transcript of spoken words. Break up transcript lines when there are pauses. Include timestamps in the format of HH:MM:SS.SSS.',
          },
          {
            type: 'file',
            data: Buffer.from(fs.readFileSync('./data/galileo.mp3')),
            mediaType: 'audio/mpeg',
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
