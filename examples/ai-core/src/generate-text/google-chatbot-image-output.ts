import { google } from '@ai-sdk/google';
import { CoreMessage, generateText } from 'ai';
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
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const result = await generateText({
      model: google('gemini-2.0-flash-exp'),
      providerOptions: {
        google: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      },
      messages,
    });

    if (result.text) {
      process.stdout.write(`\nAssistant: ${result.text}`);
    }

    if (result.images.length > 0) {
      for (const image of result.images) {
        await presentImages([image]);
      }
    }

    process.stdout.write('\n\n');

    messages.push(...result.response.messages);
  }
}

main().catch(console.error);
