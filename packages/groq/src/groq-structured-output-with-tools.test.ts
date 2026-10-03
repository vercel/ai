import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGroq } from './groq-provider';

const liveError = fs.readFileSync(
  'src/__fixtures__/groq-structured-output-with-tools-error.json',
  'utf8',
);

describe('structured output with tools', () => {
  it('does not send Groq the unsupported JSON-mode and tools combination', async () => {
    const model = createGroq({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));

        if (body.response_format != null && body.tools != null) {
          return new Response(liveError, {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }

        return Response.json({
          id: 'chatcmpl-issue-10023',
          object: 'chat.completion',
          created: 1788463910,
          model: 'openai/gpt-oss-120b',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content:
                  '[{"name":"Prepare the AI SDK issue reproduction","date":"2026-09-04"}]',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
          },
        });
      },
    })('openai/gpt-oss-120b');

    const result = await model.doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Schedule this for tomorrow.' }],
        },
      ],
      tools: [
        {
          type: 'function',
          name: 'resolveDate',
          description: 'Resolve a relative date.',
          inputSchema: {
            type: 'object',
            properties: { input: { type: 'string' } },
            required: ['input'],
          },
        },
      ],
      toolChoice: { type: 'tool', toolName: 'resolveDate' },
      responseFormat: {
        type: 'json',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              date: { type: ['string', 'null'] },
            },
            required: ['name', 'date'],
          },
        },
      },
    });

    expect(result.content).toContainEqual({
      type: 'text',
      text: '[{"name":"Prepare the AI SDK issue reproduction","date":"2026-09-04"}]',
    });
  });
});
