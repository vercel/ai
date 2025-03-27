import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
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
  while (true) {
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const { steps, response } = await generateText({
      model: anthropic('claude-3-7-sonnet-20250219'),
      tools: { weatherTool },
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
      maxSteps: 5,
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 12000 },
        } satisfies AnthropicProviderOptions,
      },
    });

    console.log('Assistant:');

    for (const step of steps) {
      if (step.reasoning) {
        console.log(`\x1b[36m${step.reasoning}\x1b[0m`);
      }

      if (step.text) {
        console.log(step.text);
      }

      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          console.log(
            `\x1b[33m${toolCall.toolName}\x1b[0m` +
              JSON.stringify(toolCall.args),
          );
        }
      }
    }

    console.log('\n');

    messages.push(...response.messages);
  }
}

main().catch(console.error);
