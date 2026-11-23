import { google, type GoogleFilePartOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import fs from 'node:fs';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: google('gemini-4-hydrogen'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: fs.readFileSync('./data/galileo.mp3'),
            mediaType: 'audio/mpeg',
            providerOptions: {
              google: {
                audioMetadata: { startOffset: '0s', endOffset: '10s' },
              } satisfies GoogleFilePartOptions,
            },
          },
          { type: 'text', text: 'Transcribe this audio clip.' },
        ],
      },
    ],
  });
  await printFullStream({ result });
});
