#!/usr/bin/env node

/**
 * Live-provider reproduction harness for vercel/ai issue #14521.
 *
 * Requires:
 *   OPENAI_API_KEY=...
 *
 * The original issue used AI SDK v4 `maxSteps: 3`. This checkout uses the
 * current equivalent `stopWhen: isStepCount(3)`.
 *
 * This script uses the real @ai-sdk/openai provider, serves
 * `result.toUIMessageStreamResponse()` through a Node.js HTTP server, fetches
 * the route as a client, and asserts that the post-tool final answer is present
 * in the streamed response body.
 */

import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import { openai } from '../packages/openai/dist/index.js';
import {
  isStepCount,
  jsonSchema,
  streamText,
  tool,
} from '../packages/ai/dist/index.js';

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY is required to run reproductions/issue-14521-openai-node-ui-stream.mjs',
  );
}

const modelId = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
let toolCalls = 0;
let steps = 0;

const server = createServer(async (_request, response) => {
  try {
    const result = streamText({
      model: openai(modelId),
      temperature: 0,
      system:
        'You MUST call getWeather exactly once before answering. After receiving the tool result, do not call any tools again. Answer exactly: FINAL_FROM_TOOL: <tool result>',
      prompt: 'Use getWeather for Berlin, then provide the final answer.',
      tools: {
        getWeather: tool({
          inputSchema: jsonSchema({
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false,
          }),
          execute: async ({ city }) => {
            toolCalls += 1;
            return `sunny in ${city}`;
          },
        }),
      },
      stopWhen: isStepCount(3),
    });

    void result.steps.then(resultSteps => {
      steps = resultSteps.length;
    });

    const webResponse = result.toUIMessageStreamResponse();
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
  const events = body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice('data: '.length))
    .filter(payload => payload !== '[DONE]')
    .map(payload => JSON.parse(payload));
  const streamedText = events
    .filter(event => event.type === 'text-delta')
    .map(event => event.delta)
    .join('');

  assert.equal(clientResponse.status, 200);
  assert.equal(toolCalls, 1, 'the OpenAI run should execute one tool call');
  assert.equal(steps, 2, 'streamText should continue to a second model step');
  assert.equal(
    streamedText,
    'FINAL_FROM_TOOL: sunny in Berlin',
    'UI message stream should include the post-tool final answer',
  );
  assert.equal(
    events.some(event => event.type === 'finish'),
    true,
    'UI message stream should include a finish event',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        modelId,
        streamedText,
        containsFinishEvent: events.some(event => event.type === 'finish'),
        toolCalls,
        steps,
        streamedBytes: Buffer.byteLength(body),
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise(resolve => server.close(resolve));
}
