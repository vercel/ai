#!/usr/bin/env node

/**
 * Reproduction harness for vercel/ai issue #14521.
 *
 * The original report was for AI SDK v4's `maxSteps > 1`. This checkout uses
 * the current API, where the equivalent multi-step setting is
 * `stopWhen: isStepCount(3)`.
 *
 * The script creates a deterministic model that:
 *   1. streams a tool call in the first model step,
 *   2. receives the tool result,
 *   3. streams final text in the second model step.
 *
 * It then serves `result.toTextStreamResponse()` through a real Node.js HTTP
 * server and fetches it as a client would. If the stream is cut off after the
 * first tool step, the assertion below fails.
 */

import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import {
  isStepCount,
  jsonSchema,
  streamText,
  tool,
} from '../packages/ai/dist/index.js';
import {
  MockLanguageModelV4,
  convertArrayToReadableStream,
} from '../packages/ai/dist/test/index.js';

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
};

let modelCalls = 0;
let toolCalls = 0;

const model = new MockLanguageModelV4({
  doStream: async () => {
    modelCalls += 1;

    if (modelCalls === 1) {
      return {
        stream: convertArrayToReadableStream([
          {
            type: 'tool-call',
            id: 'call-1',
            toolCallId: 'call-1',
            toolName: 'lookupWeather',
            input: JSON.stringify({ city: 'Berlin' }),
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          },
        ]),
      };
    }

    if (modelCalls === 2) {
      return {
        stream: convertArrayToReadableStream([
          { type: 'text-start', id: 'final-text' },
          {
            type: 'text-delta',
            id: 'final-text',
            delta: 'Final answer after the tool result.',
          },
          { type: 'text-end', id: 'final-text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      };
    }

    throw new Error(`Unexpected extra model call #${modelCalls}`);
  },
});

const server = createServer(async (_request, response) => {
  try {
    const result = streamText({
      model,
      prompt: 'What is the weather?',
      tools: {
        lookupWeather: tool({
          inputSchema: jsonSchema({
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          }),
          execute: async ({ city }) => {
            toolCalls += 1;
            return `The weather in ${city} is sunny.`;
          },
        }),
      },
      stopWhen: isStepCount(3),
    });

    const webResponse = result.toTextStreamResponse();
    response.writeHead(
      webResponse.status,
      Object.fromEntries(webResponse.headers.entries()),
    );
    Readable.fromWeb(webResponse.body).pipe(response);
  } catch (error) {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.stack : String(error));
  }
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

try {
  const { port } = server.address();
  const clientResponse = await fetch(`http://127.0.0.1:${port}/api/chat`);
  const body = await clientResponse.text();

  assert.equal(clientResponse.status, 200);
  assert.equal(modelCalls, 2, 'streamText should make the second model call');
  assert.equal(toolCalls, 1, 'the tool should be executed exactly once');
  assert.equal(
    body,
    'Final answer after the tool result.',
    'Node.js streamed response should include the post-tool final text',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        body,
        modelCalls,
        toolCalls,
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise(resolve => server.close(resolve));
}
