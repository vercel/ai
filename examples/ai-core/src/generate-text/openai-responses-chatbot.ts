import { openai } from '@ai-sdk/openai';
import { CoreMessage, generateText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { weatherTool } from '../tools/weather-tool';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: CoreMessage[] = [];

async function main() {
  let toolResponseAvailable = false;

  while (true) {
    if (!toolResponseAvailable) {
      const userInput = await terminal.question('You: ');
      messages.push({ role: 'user', content: userInput });
    }

    const { text, toolCalls, toolResults, response } = await generateText({
      model: openai.responses('gpt-4o-mini'),
      tools: { weatherTool },
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
    });

    toolResponseAvailable = false;

    if (text) {
      process.stdout.write(`\nAssistant: ${text}`);
    }

    for (const { toolName, args } of toolCalls) {
      process.stdout.write(
        `\nTool call: '${toolName}' ${JSON.stringify(args)}`,
      );
    }

    for (const { toolName, result } of toolResults) {
      process.stdout.write(
        `\nTool response: '${toolName}' ${JSON.stringify(result)}`,
      );
    }

    process.stdout.write('\n\n');

    messages.push(...response.messages);

    toolResponseAvailable = toolCalls.length > 0;
  }
}

main().catch(console.error);
