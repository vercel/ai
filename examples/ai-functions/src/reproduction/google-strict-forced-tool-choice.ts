import { google } from '@ai-sdk/google';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const modelId = 'gemini-3-flash-preview';
const prompt = 'Thanks, that all looks good to me.';

const tools = {
  createMeeting: tool({
    description: 'Create a meeting',
    inputSchema: z.object({
      title: z.string(),
      startTime: z.string(),
    }),
    strict: true,
  }),
};

async function callWithToolChoice(
  label: string,
  toolChoice: 'required' | { type: 'tool'; toolName: 'createMeeting' },
) {
  const result = await generateText({
    model: google(modelId),
    toolChoice,
    tools,
    prompt,
    temperature: 0,
  });

  console.log(
    JSON.stringify(
      {
        label,
        text: result.text,
        toolCalls: result.toolCalls,
        finishReason: result.finishReason,
      },
      null,
      2,
    ),
  );

  return result.toolCalls.some(
    toolCall => toolCall.toolName === 'createMeeting',
  );
}

async function callGoogleDirectlyWithAny() {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'createMeeting',
                description: 'Create a meeting',
                parameters: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    startTime: { type: 'string' },
                  },
                  required: ['title', 'startTime'],
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: ['createMeeting'],
          },
        },
      }),
    },
  );

  const body = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          functionCall?: { name?: string };
          text?: string;
        }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      `Direct Google ANY comparison failed with HTTP ${response.status}: ${body.error?.message ?? 'unknown error'}`,
    );
  }

  const directFunctionCall = body.candidates?.[0]?.content?.parts?.find(
    part => part.functionCall?.name === 'createMeeting',
  );

  if (directFunctionCall == null) {
    throw new Error(
      'Direct Google ANY comparison did not return createMeeting; ownership is inconclusive.',
    );
  }

  console.log(
    JSON.stringify(
      {
        label: 'direct-any',
        functionCall: directFunctionCall.functionCall,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const namedCalled = await callWithToolChoice('named', {
    type: 'tool',
    toolName: 'createMeeting',
  });
  const requiredCalled = await callWithToolChoice('required', 'required');

  if (namedCalled && requiredCalled) {
    console.log(
      'Issue #17658 did not reproduce: both forced tool choices returned createMeeting.',
    );
    return;
  }

  await callGoogleDirectlyWithAny();

  console.error(
    'ISSUE_17658_REPRODUCED: strict tools silently dropped the forced-call guarantee.',
  );
  console.error(
    `Missing createMeeting tool call for: ${[
      !namedCalled && 'named',
      !requiredCalled && 'required',
    ]
      .filter(Boolean)
      .join(', ')}.`,
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
