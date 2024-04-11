import { ExperimentalMessage, experimental_streamText } from 'ai';
import { Mistral } from '@ai-sdk/mistral';
import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';

dotenv.config();

const mistral = new Mistral();

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ExperimentalMessage[] = [];

async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = await experimental_streamText({
      model: mistral.chat('open-mistral-7b'),
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
    });

    let fullResponse = '';
    process.stdout.write('\nAssistant: ');
    for await (const delta of result.textStream) {
      fullResponse += delta;
      process.stdout.write(delta);
    }
    process.stdout.write('\n\n');

    messages.push({ role: 'assistant', content: fullResponse });
  }
}

main().catch(console.error);
