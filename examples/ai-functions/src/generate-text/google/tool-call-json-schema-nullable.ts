import { google } from '@ai-sdk/google';
import { generateText, jsonSchema, tool } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    prompt:
      'Call createContact for Ada Lovelace. Her nickname is unknown, she has no manager, and her roles are engineer and mathematician.',
    tools: {
      createContact: tool({
        inputSchema: jsonSchema({
          $schema: 'http://json-schema.org/draft-07/schema#',
          $ref: '#/$defs/contact',
          $defs: {
            contact: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 1 },
                nickname: { type: ['string', 'null'] },
                roles: {
                  type: 'array',
                  items: {
                    enum: ['engineer', 'mathematician', 'writer'],
                  },
                  minItems: 1,
                },
                manager: {
                  anyOf: [{ $ref: '#/$defs/contact' }, { type: 'null' }],
                },
              },
              required: ['name', 'nickname', 'roles', 'manager'],
              additionalProperties: false,
            },
          },
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'createContact' },
  });

  console.log(JSON.stringify(result.toolCalls, null, 2));
});
