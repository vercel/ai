import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

const liveError = fs.readFileSync(
  'src/__fixtures__/google-structured-output-with-tools-error.json',
  'utf8',
);

describe('structured output with tools', () => {
  it('does not send Google the unsupported JSON response and function-calling combination', async () => {
    const model = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));

        if (
          body.generationConfig?.responseMimeType === 'application/json' &&
          body.tools != null
        ) {
          return new Response(liveError, {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        }

        return Response.json({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    text: '[{"name":"Prepare the AI SDK issue reproduction","date":"2026-09-04"}]',
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 10,
            totalTokenCount: 20,
          },
        });
      },
    })('gemini-2.5-flash-lite');

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
