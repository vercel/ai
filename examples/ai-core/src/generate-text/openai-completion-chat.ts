import { generateText } from 'ai/core';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateText({
    model: openai.completion({ id: 'gpt-3.5-turbo-instruct' }),
    maxTokens: 1024,
    system: 'You are a helpful chatbot.',
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
      {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
      },
      {
        role: 'user',
        content: 'I need help with my computer.',
      },
    ],
  });

  console.log(result.text);
}

main();
