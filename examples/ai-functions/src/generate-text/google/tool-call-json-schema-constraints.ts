import { google } from '@ai-sdk/google';
import { generateText, jsonSchema, tool } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt:
      'Call createOrder for exactly 3 red widgets. Use order code ABC-42 and tags priority and fragile.',
    tools: {
      createOrder: tool({
        inputSchema: jsonSchema({
          $schema: 'http://json-schema.org/draft-07/schema#',
          $ref: '#/$defs/order',
          $defs: {
            order: {
              type: 'object',
              properties: {
                code: { type: 'string', pattern: '^[A-Z]{3}-[0-9]{2}$' },
                quantity: {
                  type: 'integer',
                  minimum: 1,
                  maximum: 10,
                },
                color: { type: 'string', enum: ['red', 'green', 'blue'] },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 2,
                  maxItems: 2,
                  uniqueItems: true,
                },
                followUp: { $ref: '#/$defs/order' },
              },
              required: ['code', 'quantity', 'color', 'tags'],
              additionalProperties: false,
            },
          },
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'createOrder' },
  });

  console.log(JSON.stringify(result.toolCalls, null, 2));
});
