import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import * as fs from 'fs';
import { describe, expect, it } from 'vitest';
import { createGoogleGenerativeAI } from './google-provider';

const validatedResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/google-strict-forced-tool-choice-validated.json',
    'utf8',
  ),
);
const anyResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/google-strict-forced-tool-choice-any.json',
    'utf8',
  ),
);

const prompt: LanguageModelV3CallOptions['prompt'] = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Thanks, that all looks good to me.' }],
  },
];

const tools: LanguageModelV3CallOptions['tools'] = [
  {
    type: 'function',
    name: 'createMeeting',
    description: 'Create a meeting',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        startTime: { type: 'string' },
      },
      required: ['title', 'startTime'],
      additionalProperties: false,
    },
    strict: true,
  },
];

describe('strict forced tool choice', () => {
  it.each([
    ['named', { type: 'tool', toolName: 'createMeeting' } as const],
    ['required', { type: 'required' } as const],
  ])(
    'preserves the forced-call guarantee for %s tool choice',
    async (_label, toolChoice) => {
      const provider = createGoogleGenerativeAI({
        apiKey: 'test-api-key',
        generateId: () => 'test-generated-id',
        fetch: async (_input, init) => {
          const requestBody = JSON.parse(String(init?.body));
          const mode = requestBody.toolConfig.functionCallingConfig
            .mode as string;
          const responseBody = mode === 'ANY' ? anyResponse : validatedResponse;

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      });

      const result = await provider('gemini-3-flash-preview').doGenerate({
        prompt,
        tools,
        toolChoice,
      });

      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'tool-call',
            toolName: 'createMeeting',
          }),
        ]),
      );
    },
  );
});
