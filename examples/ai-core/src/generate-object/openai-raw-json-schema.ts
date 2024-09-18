import { openai } from '@ai-sdk/openai';
import { generateObject, jsonSchema } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateObject({
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

  console.log(JSON.stringify(result.object.recipe, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);
