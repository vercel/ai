import { google } from '@ai-sdk/google';
import { ModelMessage, generateText } from 'ai';
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

    const result = await generateText({
      model: google('gemini-2.0-flash-exp'),
      providerOptions: {
        google: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      messages,
    });

    if (result.text) {
      process.stdout.write(`\nAssistant: ${result.text}`);
    }

    for (const file of result.files) {
      if (file.mediaType.startsWith('image/')) {
        await presentImages([file]);
      }
    }

    process.stdout.write('\n\n');

    messages.push(...result.response.messages);
  }
}

main().catch(console.error);
