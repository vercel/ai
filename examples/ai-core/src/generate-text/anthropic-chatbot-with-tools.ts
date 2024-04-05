import { ExperimentalMessage, experimental_generateText } from 'ai';
import { anthropic } from 'ai/anthropic';
import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ExperimentalMessage[] = [];

async function main() {
  let toolResponseAvailable = false;

  while (true) {
    if (!toolResponseAvailable) {
      const userInput = await terminal.question('You: ');
      messages.push({ role: 'user', content: userInput });
    }

    const { text, toolCalls, toolResults } = await experimental_generateText({
      model: anthropic.messages('claude-3-opus-20240229'),
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

    messages.push({
      role: 'assistant',
      content: [{ type: 'text', text }, ...(toolCalls ?? [])],
    });

    if (toolResults.length > 0) {
      messages.push({ role: 'tool', content: toolResults });
    }

    toolResponseAvailable = toolCalls.length > 0;
  }
}

main().catch(console.error);
