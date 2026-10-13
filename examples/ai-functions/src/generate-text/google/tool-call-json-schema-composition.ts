import { google } from '@ai-sdk/google';
import { generateText, jsonSchema, tool } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-3.8-flash'),
    prompt:
      'Call provideResponse. Select banana as a fruit with confidence 0.95. Do not add related selections.',
    tools: {
      provideResponse: tool({
        inputSchema: jsonSchema({
          $schema: 'http://json-schema.org/draft-07/schema#',
          $ref: '#/$defs/response',
          $defs: {
            response: {
              type: 'object',
              properties: {
                selection: {
                  oneOf: [
                    {
                      type: 'object',
                      properties: {
                        type: { const: 'fruit' },
                        name: { type: 'string' },
                      },
                      required: ['type', 'name'],
                      additionalProperties: false,
                    },
                    {
                      type: 'object',
                      properties: {
                        type: { const: 'vegetable' },
                        name: { type: 'string' },
                      },
                      required: ['type', 'name'],
                      additionalProperties: false,
                    },
                  ],
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                related: {
                  type: 'array',
                  items: { $ref: '#/$defs/response' },
                  maxItems: 2,
                },
              },
              required: ['selection', 'confidence'],
              additionalProperties: false,
            },
          },
        }),
      }),
    },
    toolChoice: { type: 'tool', toolName: 'provideResponse' },
  });

  console.log(JSON.stringify(result.toolCalls, null, 2));
});
