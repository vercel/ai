import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModel } from '../test/mock-language-model';
import { generateObject } from './generate-object';

describe('result.object', () => {
  it('should generate object with json mode', async () => {
    const result = await generateObject({
      model: new MockLanguageModel({
        objectMode: 'json',
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'object-json' });
          assert.deepStrictEqual(prompt, {
            system:
              'JSON schema:\n' +
              '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
              'You MUST answer with a JSON object that matches the JSON schema above.',
            messages: [{ role: 'user', content: 'prompt' }],
          });

          return {
            text: `{ "content": "Hello, world!" }`,
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'prompt',
    });

    assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
  });

  it('should generate object with tool mode', async () => {
    const result = await generateObject({
      model: new MockLanguageModel({
        objectMode: 'tool',
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'object-tool',
            tool: {
              name: 'json',
              description: 'Respond with a JSON object.',
              parameters: {
                $schema: 'http://json-schema.org/draft-07/schema#',
                additionalProperties: false,
                properties: { content: { type: 'string' } },
                required: ['content'],
                type: 'object',
              },
            },
          });
          assert.deepStrictEqual(prompt, {
            messages: [{ role: 'user', content: 'prompt' }],
          });

          return {
            toolCalls: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'json',
                args: `{ "content": "Hello, world!" }`,
              },
            ],
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'prompt',
    });

    assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
  });
});
