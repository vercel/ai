import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModel } from '../test/mock-language-model';
import { generateText } from './generate-text';

describe('result.text', () => {
  it('should generate text', async () => {
    const result = await generateText({
      model: new MockLanguageModel({
        objectMode: 'json',
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'regular' });
          assert.deepStrictEqual(prompt, {
            messages: [{ role: 'user', content: 'prompt' }],
          });

          return {
            text: `Hello, world!`,
          };
        },
      }),
      prompt: 'prompt',
    });

    assert.deepStrictEqual(result.text, 'Hello, world!');
  });
});
