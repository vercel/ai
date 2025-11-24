import { vertex } from '@ai-sdk/google-vertex';
import { ModelMessage, streamText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { presentImages } from '../lib/present-image';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

async function main() {
  while (true) {
    messages.push({ role: 'user', content: await terminal.question('You: ') });

    const result = streamText({
      model: vertex('gemini-3-pro-image-preview'),
      providerOptions: {
        google: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      messages,
    });

    process.stdout.write('\nAssistant: ');

    for await (const delta of result.fullStream) {
      switch (delta.type) {
        case 'reasoning-delta': {
          process.stdout.write('\x1b[34m' + delta.text + '\x1b[0m');
          break;
        }
        case 'text-delta': {
          process.stdout.write(delta.text);
          break;
        }

        case 'file': {
          if (delta.file.mediaType.startsWith('image/')) {
            console.log('\n[Image generated]');
            await presentImages([delta.file]);
          }
          break;
        }
      }
    }
    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
}

main().catch(console.error);
