import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

async function main() {
  const result = await openai('gpt-4-turbo').doStream({
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
        },
        required: ['text'],
      },
    },
    temperature: 0,
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Invent a new holiday and describe its traditions. Output as JSON object.',
          },
        ],
      },
    ],
  });

  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value.type === 'text') {
      process.stdout.write(value.text);
    }
  }
}

main().catch(console.error);
