import 'dotenv/config';
import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { readFile } from 'node:fs/promises';
import { GoogleJSONAccumulator } from '../../../../packages/google/src/google-json-accumulator';
import { type LanguageModel, streamText, tool } from 'ai';
import { z } from 'zod';

const reportedError =
  'Please ensure that function call turn comes immediately after a user turn or after a function response turn.';

type VertexFixtureChunk = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        functionCall?: {
          name?: string;
          partialArgs?: Array<{
            jsonPath: string;
            stringValue?: string | null;
            numberValue?: number | null;
            boolValue?: boolean | null;
            nullValue?: unknown;
            willContinue?: boolean | null;
          }>;
        };
        thoughtSignature?: string;
      }>;
    };
  }>;
};

async function loadRecordedVertexToolCall() {
  const fixtureUrl = new URL(
    '../../../../packages/google/src/__fixtures__/google-vertex-stream-tool-call-arguments-nested.1.chunks.txt',
    import.meta.url,
  );
  const chunks = (await readFile(fixtureUrl, 'utf8'))
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as VertexFixtureChunk);

  const accumulator = new GoogleJSONAccumulator();
  let thoughtSignature: string | undefined;
  let toolName: string | undefined;

  for (const chunk of chunks) {
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      toolName ??= part.functionCall?.name;
      thoughtSignature ??= part.thoughtSignature;

      if (part.functionCall?.partialArgs != null) {
        accumulator.processPartialArgs(part.functionCall.partialArgs);
      }
    }
  }

  if (toolName == null || thoughtSignature == null) {
    throw new Error(
      'Recorded Vertex fixture is missing its tool call metadata',
    );
  }

  return {
    input: JSON.parse(accumulator.finalize().finalJSON) as {
      recipe: {
        name: string;
        ingredients: Array<{ name: string; amount: string }>;
        steps: string[];
      };
    },
    thoughtSignature,
    toolName,
  };
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const details = error as Error & {
      responseBody?: unknown;
      data?: unknown;
    };
    return [
      error.message,
      typeof details.responseBody === 'string'
        ? details.responseBody
        : JSON.stringify(details.responseBody),
      JSON.stringify(details.data),
    ].join('\n');
  }

  return String(error);
}

async function main() {
  const recordedToolCall = await loadRecordedVertexToolCall();
  const toolCallId = 'recorded-vertex-call';
  let directRequestThoughtSignature: string | undefined;

  const cookRecipe = tool({
    description: 'Cook a recipe.',
    inputSchema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({
            name: z.string(),
            amount: z.string(),
          }),
        ),
        steps: z.array(z.string()),
      }),
    }),
  });

  const messages = [
    { role: 'user' as const, content: 'Hello' },
    {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: '' }],
    },
    {
      role: 'assistant' as const,
      content: [
        {
          type: 'tool-call' as const,
          toolCallId,
          toolName: recordedToolCall.toolName,
          input: recordedToolCall.input,
          providerOptions: {
            vertex: {
              thoughtSignature: recordedToolCall.thoughtSignature,
            },
          },
        },
      ],
    },
    {
      role: 'tool' as const,
      content: [
        {
          type: 'tool-result' as const,
          toolCallId,
          toolName: recordedToolCall.toolName,
          output: {
            type: 'json' as const,
            value: { status: 'recipe cooked' },
          },
        },
      ],
    },
  ];

  async function run(
    label: string,
    model: LanguageModel | string,
    providerOptions?: {
      gateway: {
        only: string[];
      };
    },
  ) {
    const result = streamText({
      model,
      tools: { cookRecipe },
      messages,
      providerOptions,
    });

    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'error') {
          throw chunk.error;
        }
      }
    } catch (error) {
      const errorText = getErrorText(error);
      if (errorText.includes(reportedError)) {
        console.error(`ISSUE #13055 REPRODUCED (${label}): ${reportedError}`);
        process.exitCode = 1;
        return false;
      }

      throw error;
    }

    console.log(`${label}: accepted the recorded Vertex tool-call turn.`);
    return true;
  }

  const gatewaySucceeded = await run(
    'AI Gateway → Google AI Studio',
    'google/gemini-3.1-pro-preview',
    {
      gateway: {
        only: ['google'],
      } satisfies GatewayProviderOptions,
    },
  );
  if (!gatewaySucceeded) {
    return;
  }

  const directGoogle = createGoogleGenerativeAI({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const request = JSON.parse(init.body) as {
          contents?: Array<{
            parts?: Array<{ thoughtSignature?: string }>;
          }>;
        };
        directRequestThoughtSignature = request.contents
          ?.flatMap(content => content.parts ?? [])
          .find(part => part.thoughtSignature != null)?.thoughtSignature;
      }

      return fetch(input, init);
    },
  });

  const directSucceeded = await run(
    'Direct Google customtools endpoint',
    directGoogle('gemini-3.1-pro-preview-customtools'),
  );
  if (!directSucceeded) {
    return;
  }

  if (directRequestThoughtSignature !== recordedToolCall.thoughtSignature) {
    throw new Error(
      'Direct request did not contain the recorded Vertex thought signature',
    );
  }
  console.log(
    'Direct request retained providerOptions.vertex.thoughtSignature on the Google customtools wire request.',
  );

  console.log(
    'Issue #13055 not reproduced: both the reported Gateway fallback target and the direct Google customtools endpoint accepted the turn.',
  );
}

main().catch(error => {
  console.error(getErrorText(error));
  process.exitCode = 2;
});
