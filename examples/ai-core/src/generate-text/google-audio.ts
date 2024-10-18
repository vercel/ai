import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

async function main() {
  const result = await generateText({
    model: google('gemini-1.5-flash'),
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

  console.log(result.text);
}

main().catch(console.error);
