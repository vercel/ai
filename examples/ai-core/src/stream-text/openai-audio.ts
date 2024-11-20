import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = streamText({
    model: openai('gpt-4o-audio-preview'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is the audio saying?' },
          {
            type: 'file',
            mimeType: 'audio/mpeg',
            data: fs.readFileSync('./data/galileo.mp3'),
          },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
