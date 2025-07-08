import { createAnthropic } from '@ai-sdk/anthropic';
import { ModelMessage, generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const { content, response } = await generateText({
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
      stopWhen: stepCountIs(3),
    });

    console.log('Assistant:');
    for (const part of content) {
      if (part.type === 'text') {
        console.log(part.text);
      } else {
        console.log(JSON.stringify(part, null, 2));
      }
    }

    console.log();
    console.log();

    messages.push(...response.messages);
  }
}

main().catch(console.error);
