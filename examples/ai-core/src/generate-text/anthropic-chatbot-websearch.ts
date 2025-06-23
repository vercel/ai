import { anthropic } from '@ai-sdk/anthropic';
import { ModelMessage, generateText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

async function main() {
  let toolResponseAvailable = false;

  while (true) {
    if (!toolResponseAvailable) {
      const userInput = await terminal.question('You: ');
      messages.push({ role: 'user', content: userInput });
    }

    const { text, toolCalls, toolResults, response } = await generateText({
      model: anthropic('claude-3-5-sonnet-latest'),
      tools: {
        web_search: anthropic.tools.webSearch_20250305({
          onInputAvailable: async ({ input }) => {
            process.stdout.write(`\nTool call: '${JSON.stringify(input)}'`);
          },
        }),
      },
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
    });

    toolResponseAvailable = false;

    for (const { toolName, output } of toolResults) {
      process.stdout.write(
        `\nTool response: '${toolName}' ${JSON.stringify(output)}`,
      );
    }

    if (text) {
      process.stdout.write(`\nAssistant: ${text}`);
    }

    process.stdout.write('\n\n');

    messages.push(...response.messages);

    toolResponseAvailable = toolCalls.length > 0;
  }
}

main().catch(console.error);
