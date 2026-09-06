import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

// Video input: kimi-k3, kimi-k2.7-code, kimi-k2.6, and kimi-k2.5 accept video
// file parts. Inline bytes are sent as a base64 data URI; URL parts are
// downloaded and inlined by the AI SDK (Moonshot AI does not fetch URLs).
run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize what happens in this video.' },
          {
            type: 'file',
            data: fs.readFileSync('data/prudence.mp4'),
            mediaType: 'video/mp4',
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
});
