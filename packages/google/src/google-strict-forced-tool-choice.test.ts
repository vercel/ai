import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GoogleLanguageModel } from './google-language-model';

const validatedResponse = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/google-strict-forced-tool-choice-validated.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const anyResponse = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/google-strict-forced-tool-choice-any.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('strict forced tool choice', () => {
  it('preserves the required tool-call outcome for named and required choices', async () => {
    const observedModes: string[] = [];

    const model = new GoogleLanguageModel('gemini-3-flash-preview', {
      provider: 'google.generative-ai',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      headers: { 'x-goog-api-key': 'test-api-key' },
      generateId: () => 'test-id',
      fetch: async (_input, init) => {
        const requestBody = JSON.parse(String(init?.body));
        const mode = requestBody.toolConfig.functionCallingConfig.mode;
        observedModes.push(mode);

        return Response.json(mode === 'ANY' ? anyResponse : validatedResponse);
      },
    });

    const missingToolCalls: string[] = [];

    for (const [label, toolChoice] of [
      ['named', { type: 'tool', toolName: 'createMeeting' } as const],
      ['required', { type: 'required' } as const],
    ] as const) {
      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Thanks, that all looks good to me.',
              },
            ],
          },
        ],
        tools: [
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
          },
          {
            type: 'function',
            name: 'inspectCalendar',
            description: 'Inspect the calendar',
            inputSchema: {
              type: 'object',
              properties: {
                calendarId: { type: 'string' },
              },
              required: ['calendarId'],
              additionalProperties: false,
            },
            strict: true,
          },
        ],
        toolChoice,
      });

      if (
        !result.content.some(
          part =>
            part.type === 'tool-call' && part.toolName === 'createMeeting',
        )
      ) {
        missingToolCalls.push(label);
      }
    }

    expect(
      missingToolCalls,
      'forced tool choices must return a tool call',
    ).toEqual([]);
    expect(observedModes).toEqual(['ANY', 'ANY']);
  });
});
