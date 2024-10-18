import { openai } from '@ai-sdk/openai';
import { CoreMessage, streamText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { weatherTool } from '../tools/weather-tool';

async function main() {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const messages: CoreMessage[] = [];

  while (true) {
    const userInput = await terminal.question('You: ');
    messages.push({ role: 'user', content: userInput });

    const result = await streamText({
      model: openai('gpt-3.5-turbo'),
      tools: { weatherTool },
      maxSteps: 5,
      system: `You are a helpful, respectful and honest assistant.`,
      messages,
    });

    let fullResponse = '';

    for await (const delta of result.fullStream) {
      switch (delta.type) {
        case 'text-delta': {
          if (fullResponse.length === 0) {
            process.stdout.write('\nAssistant: ');
          }

          fullResponse += delta.textDelta;
          process.stdout.write(delta.textDelta);
          break;
        }

        case 'tool-call': {
          process.stdout.write(
            `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.args)}`,
          );
          break;
        }

        case 'tool-result': {
          process.stdout.write(
            `\nTool response: '${delta.toolName}' ${JSON.stringify(
              delta.result,
            )}`,
          );
          break;
        }
      }
    }

    process.stdout.write('\n\n');

    messages.push(...(await result.responseMessages));
  }
}

main().catch(console.error);
