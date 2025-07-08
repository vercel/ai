import { createAnthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { ModelMessage, generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { weatherTool } from '../tools/weather-tool';

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
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

    const { steps, response } = await generateText({
      model: anthropic('claude-3-7-sonnet-20250219'),
      tools: { weatherTool },
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
      stopWhen: stepCountIs(5),
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 12000 },
        } satisfies AnthropicProviderOptions,
      },
    });

    console.log('Assistant:');

    for (const step of steps) {
      if (step.reasoningText) {
        console.log(`\x1b[36m${step.reasoningText}\x1b[0m`);
      }

      if (step.text) {
        console.log(step.text);
      }

      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          console.log(
            `\x1b[33m${toolCall.toolName}\x1b[0m` +
              JSON.stringify(toolCall.input),
          );
        }
      }
    }

    console.log('\n');

    messages.push(...response.messages);
  }
}

main().catch(console.error);
