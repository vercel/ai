import { cohere } from '@ai-sdk/cohere';
import { CoreMessage, streamText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { weatherTool } from '../tools/weather-tool';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];

async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = await streamText({
      model: cohere('command-r-plus'),
      tools: { weather: weatherTool },
      maxSteps: 5,
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
