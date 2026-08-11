import { createGoogle } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const failureSignal =
  'ISSUE_17658_REPRODUCED: strict tools allowed forced tool choices to return text instead of a required tool call';

const validatedResponse = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/google/src/__fixtures__/google-strict-forced-tool-choice-validated.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const anyResponse = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/google/src/__fixtures__/google-strict-forced-tool-choice-any.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

async function main() {
  const observedModes: string[] = [];

  const google = createGoogle({
    apiKey: 'fixture-api-key',
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
    ['required', 'required' as const],
  ] as const) {
    const result = await generateText({
      model: google('gemini-3-flash-preview'),
      toolChoice,
      tools: {
        createMeeting: tool({
          description: 'Create a meeting',
          inputSchema: z.object({
            title: z.string(),
            startTime: z.string(),
          }),
        }),
        inspectCalendar: tool({
          description: 'Inspect the calendar',
          inputSchema: z.object({
            calendarId: z.string(),
          }),
          strict: true,
        }),
      },
      prompt: 'Thanks, that all looks good to me.',
    });

    if (
      !result.toolCalls.some(toolCall => toolCall.toolName === 'createMeeting')
    ) {
      missingToolCalls.push(label);
    }
  }

  if (missingToolCalls.length > 0) {
    console.error(failureSignal);
    console.error(
      `Missing tool calls for: ${missingToolCalls.join(', ')}; request modes: ${observedModes.join(', ')}`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
