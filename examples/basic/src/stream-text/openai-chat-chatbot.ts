import { ChatPrompt, streamText } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';
import * as readline from 'node:readline/promises';

dotenv.config();

const systemPrompt = `You are a helpful, respectful and honest assistant.`;

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const chat: ChatPrompt = { system: systemPrompt, messages: [] };

async function main() {
  while (true) {
    const userInput = await terminal.question('You: ');

    chat.messages.push({ role: 'user', content: userInput });

    const result = await streamText({
      model: openai.chat({ id: 'gpt-3.5-turbo' }),
      prompt: chat,
    });

    let fullResponse = '';
    process.stdout.write('\nAssistant : ');
    for await (const delta of result.textStream) {
      fullResponse += delta;
      process.stdout.write(delta);
    }
    process.stdout.write('\n\n');

    chat.messages.push({ role: 'assistant', content: fullResponse });
  }
}

main().catch(console.error);
