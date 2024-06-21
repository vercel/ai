import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { generateObject } from './generate-object';

const dummyResponseValues = {
  rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  finishReason: 'stop' as const,
  usage: { promptTokens: 10, completionTokens: 20 },
};

describe('result.object', () => {
  it('should generate object with json mode', async () => {
    const result = await generateObject({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'object-json' });
          assert.deepStrictEqual(prompt, [
            {
              role: 'system',
              content:
                'JSON schema:\n' +
                '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
                'You MUST answer with a JSON object that matches the JSON schema above.',
            },
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
          ]);

          return {
            ...dummyResponseValues,
            text: `{ "content": "Hello, world!" }`,
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
  });

  it('should generate object with tool mode', async () => {
    const result = await generateObject({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'object-tool',
            tool: {
              type: 'function',
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
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
          ]);

          return {
            ...dummyResponseValues,
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                args: `{ "content": "Hello, world!" }`,
              },
            ],
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'tool',
      prompt: 'prompt',
    });

    assert.deepStrictEqual(result.object, { content: 'Hello, world!' });
  });
});

describe('result.toJsonResponse', () => {
  it('should return JSON response', async () => {
    const result = await generateObject({
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          return {
            ...dummyResponseValues,
            text: `{ "content": "Hello, world!" }`,
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    const response = result.toJsonResponse();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get('Content-Type'),
      'application/json; charset=utf-8',
    );

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
      ['{"content":"Hello, world!"}'],
    );
  });
});
