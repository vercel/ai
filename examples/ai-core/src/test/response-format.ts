import { google } from '@ai-sdk/google';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await google('models/gemini-1.5-pro-latest').doStream({
    mode: { type: 'regular' },
    inputFormat: 'prompt',
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
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Invent a new holiday and describe its traditions.',
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

    if (value.type === 'text-delta') {
      process.stdout.write(value.textDelta);
    }
  }
}

main().catch(console.error);
