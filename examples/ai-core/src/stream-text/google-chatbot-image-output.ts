import { google } from '@ai-sdk/google';
import { CoreMessage, streamText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { presentImages } from '../lib/present-image';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];

async function main() {
  while (true) {
    messages.push({ role: 'user', content: await terminal.question('You: ') });

    const result = streamText({
      model: google('gemini-2.0-flash-exp'),
      providerOptions: {
        google: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      messages,
    });

    process.stdout.write('\nAssistant: ');
    for await (const delta of result.fullStream) {
      switch (delta.type) {
        case 'text-delta': {
          process.stdout.write(delta.textDelta);
          break;
        }

        case 'file': {
          if (delta.mimeType.startsWith('image/')) {
            console.log();
            await presentImages([delta]);
          }
        }
      }
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
}

main().catch(console.error);
