import { openai } from '@ai-sdk/openai';
import { jsonSchema, streamObject } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamObject({
    model: openai('gpt-4-turbo'),
    schema: jsonSchema<{
      recipe: {
        name: string;
        ingredients: { name: string; amount: string }[];
        steps: string[];
      };
    }>({
      type: 'object',
      properties: {
        recipe: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            ingredients: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  amount: { type: 'string' },
                },
                required: ['name', 'amount'],
              },
            },
            steps: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['name', 'ingredients', 'steps'],
        },
      },
      required: ['recipe'],
    }),
    prompt: 'Generate a lasagna recipe.',
  });

  for await (const partialObject of result.partialObjectStream) {
    console.clear();
    console.log(JSON.stringify(partialObject, null, 2));
  }
}

main().catch(console.error);
