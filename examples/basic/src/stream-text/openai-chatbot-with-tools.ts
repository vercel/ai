import {
  ChatPrompt,
  ToolCallPart,
  ToolResultPart,
  streamText,
} from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { weatherTool } from '../tools/weather-tool';

dotenv.config();

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const chat: ChatPrompt = {
  system: `You are a helpful, respectful and honest assistant.`,
  messages: [],
};

async function main() {
  let toolResponseAvailable = false;

  while (true) {
    if (!toolResponseAvailable) {
      const userInput = await terminal.question('You: ');
      chat.messages.push({ role: 'user', content: userInput });
    }

    const result = await streamText({
      model: openai.chat({ id: 'gpt-3.5-turbo' }),
      tools: [weatherTool],
      prompt: chat,
    });

    toolResponseAvailable = false;
    let fullResponse = '';
    const toolCalls: ToolCallPart[] = [];
    const toolResponses: ToolResultPart[] = [];

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
          toolCalls.push(delta);

          process.stdout.write(
            `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.args)}`,
          );
          break;
        }

        case 'tool-result': {
          toolResponses.push(delta);

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

    chat.messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: fullResponse }, ...toolCalls],
    });

    if (toolResponses.length > 0) {
      chat.messages.push({ role: 'tool', content: toolResponses });
    }

    toolResponseAvailable = toolCalls.length > 0;
  }
}

main().catch(console.error);
