import { APICallError, type LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const TEST_PROMPT: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Do not call tools. Reply only OK.' }],
  },
];

describe('Anthropic root-union tool input schemas', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

  it('rejects an incompatible root union locally with the tool name and wrapping remedy', async () => {
    const liveErrorFixture = fs.readFileSync(
      'src/__fixtures__/anthropic-root-union-tool-schema-error.json',
      'utf8',
    );

    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'error',
      status: 400,
      body: liveErrorFixture,
    };

    const model = createAnthropic({ apiKey: 'test-api-key' })(
      'claude-sonnet-4-6',
    );

    let caughtError: unknown;

    try {
      await model.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'function',
            name: 'lookup',
            description: 'Look up an item or search for items.',
            inputSchema: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    action: { type: 'string', const: 'lookup' },
                    id: { type: 'string' },
                  },
                  required: ['action', 'id'],
                  additionalProperties: false,
                },
                {
                  type: 'object',
                  properties: {
                    action: { type: 'string', const: 'search' },
                    query: { type: 'string' },
                  },
                  required: ['action', 'query'],
                  additionalProperties: false,
                },
              ],
            },
          },
        ],
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect(APICallError.isInstance(caughtError)).toBe(false);

    const message = (caughtError as Error).message;
    expect(message).toContain('lookup');
    expect(message).toMatch(/object/i);
    expect(message).toMatch(/property|nested|wrap|beneath/i);
    expect(server.calls).toHaveLength(0);
  });
});
