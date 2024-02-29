import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModel } from '../test/mock-language-model';
import { generateObject } from './generate-object';

describe('result.object', () => {
  it('should generate object', async () => {
    const result = await generateObject({
      model: new MockLanguageModel({
        doGenerateJsonText: async ({ prompt }) => {
          return {
            jsonText: `{ "hello": "${prompt}" }`,
          };
        },
      }),
      schema: z.object({
        hello: z.string(),
      }),
      prompt: 'world',
    });

    assert.deepStrictEqual(result.object, { hello: 'world' });
  });
});
