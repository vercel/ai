import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
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
          { type: 'text', text: 'Describe the image in detail.' },
          { type: 'image', image: fs.readFileSync('./data/comic-cat.png') },
        ],
      },
    ],
    providerOptions: {
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
      } satisfies GoogleGenerativeAIProviderOptions,
    },
  });

  console.log(result.text);
}

main().catch(console.error);
