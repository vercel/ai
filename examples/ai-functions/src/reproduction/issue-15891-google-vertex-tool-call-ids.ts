import { createVertex } from '@ai-sdk/google-vertex';
import assert from 'node:assert/strict';
import {
  stepCountIs,
  streamText,
  tool,
  type ModelMessage,
  zodSchema,
} from 'ai';
import { z } from 'zod';

type VertexRequestBody = {
  contents?: Array<{
    parts?: Array<{
      functionCall?: { id?: unknown };
      functionResponse?: { id?: unknown };
    }>;
  }>;
};

const reportedError =
  'Invalid JSON payload received. Unknown name "id" at ' +
  "'contents[1].parts[0].function_call': Cannot find field.\n" +
  'Invalid JSON payload received. Unknown name "id" at ' +
  "'contents[2].parts[0].function_response': Cannot find field.";

function createSseResponse(events: unknown[]) {
  return new Response(
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

function hasFunctionCallId(body: VertexRequestBody) {
  return body.contents?.some(content =>
    content.parts?.some(
      part =>
        part.functionCall?.id != null || part.functionResponse?.id != null,
    ),
  );
}

async function main() {
  const requestBodies: VertexRequestBody[] = [];
  let requestCount = 0;

  const vertex = createVertex({
    apiKey: 'reproduction-api-key',
    generateId: () => 'generated-tool-call-id',
    fetch: async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('missing JSON request body');
      }
      const body = JSON.parse(init.body) as VertexRequestBody;
      requestBodies.push(body);
      requestCount++;

      if (hasFunctionCallId(body)) {
        return new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: reportedError,
              status: 'INVALID_ARGUMENT',
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      if (requestCount === 1) {
        return createSseResponse([
          {
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [
                    {
                      functionCall: {
                        name: 'sum',
                        args: { a: 25, b: 17 },
                      },
                      thoughtSignature: 'reproduction-thought-signature',
                    },
                  ],
                },
                index: 0,
              },
            ],
          },
          {
            candidates: [
              {
                content: { role: 'model', parts: [{ text: '' }] },
                finishReason: 'STOP',
                index: 0,
              },
            ],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 3,
              totalTokenCount: 13,
            },
          },
        ]);
      }

      return createSseResponse([
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'The result was 42.' }],
              },
              finishReason: 'STOP',
              index: 0,
            },
          ],
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 5,
            totalTokenCount: 25,
          },
        },
      ]);
    },
  });

  const sumTool = tool({
    description: 'Add two numbers and return the sum.',
    inputSchema: zodSchema(z.object({ a: z.number(), b: z.number() })),
    execute: async ({ a, b }) => ({ result: a + b }),
  });

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'What is 25 + 17? Use the sum tool.',
    },
  ];

  const turn1 = streamText({
    model: vertex('gemini-3.5-flash'),
    tools: { sum: sumTool },
    messages,
    stopWhen: stepCountIs(1),
  });

  let sawToolCall = false;
  let sawToolResult = false;
  for await (const part of turn1.fullStream) {
    sawToolCall ||= part.type === 'tool-call';
    sawToolResult ||= part.type === 'tool-result';
  }
  assert.ok(sawToolCall, 'turn 1 did not produce a tool call');
  assert.ok(sawToolResult, 'turn 1 did not execute the tool');

  const turn1Messages = (await turn1.steps).at(-1)?.response.messages;
  assert.ok(turn1Messages, 'turn 1 did not produce response messages');
  messages.push(...turn1Messages);
  messages.push({ role: 'user', content: 'Thanks, what was the result?' });

  const turn2 = streamText({
    model: vertex('gemini-3.5-flash'),
    tools: { sum: sumTool },
    messages,
  });

  try {
    for await (const _part of turn2.fullStream) {
      // Drain the second turn, matching the reported reproduction.
    }
  } catch (error) {
    if (String(error).includes('Unknown name \\"id\\"')) {
      throw new Error(`ISSUE_15891_REPRODUCED: ${reportedError}`);
    }
    throw error;
  }

  assert.equal(requestBodies.length, 2, 'expected exactly two Vertex requests');
  assert.equal(
    hasFunctionCallId(requestBodies[1]),
    false,
    'Vertex turn 2 included unsupported function call/result IDs',
  );
  assert.equal(await turn2.text, 'The result was 42.');

  console.log(
    'Issue #15891 could not be reproduced: the Vertex turn-2 request omitted functionCall.id and functionResponse.id, and the tool conversation completed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
