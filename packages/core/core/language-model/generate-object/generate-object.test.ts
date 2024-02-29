import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModel } from '../test/mock-language-model';
import { generateObject } from './generate-object';

describe('result.object', () => {
  it('should generate object with JSON mode', async () => {
    const result = await generateObject({
      model: new MockLanguageModel({
        objectMode: 'JSON',
        doGenerateJsonText: async ({ prompt, objectMode }) => {
          assert.strictEqual(objectMode, 'JSON');

          return {
            jsonText: `{ "content": "Hello, ${prompt}!" }`,
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'world',
    });

    assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
  });

  it('should generate object with TOOL mode', async () => {
    const result = await generateObject({
      model: new MockLanguageModel({
        objectMode: 'TOOL',
        doGenerateJsonText: async ({ prompt, objectMode }) => {
          assert.strictEqual(objectMode, 'TOOL');

          return {
            jsonText: `{ "content": "Hello, ${prompt}!" }`,
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'world',
    });

    assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
  });
});
