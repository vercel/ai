import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { APICallError } from '@ai-sdk/provider';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { generateText, tool } from 'ai';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const unsupportedModels = [
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
] as const;

const fixtureDirectory = fileURLToPath(
  new URL('../../../../packages/moonshotai/src/__fixtures__/', import.meta.url),
);

function readFixture(filename: string): unknown {
  return JSON.parse(
    fs.readFileSync(`${fixtureDirectory}/${filename}.json`, 'utf8'),
  );
}

const requests: Array<Record<string, unknown>> = [];

const replayFetch: FetchFunction = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
  requests.push(body);

  if (
    unsupportedModels.includes(
      body.model as (typeof unsupportedModels)[number],
    ) &&
    body.tool_choice === 'required'
  ) {
    return new Response(
      JSON.stringify(readFixture('moonshotai-required-tool-choice-error')),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  const fixture =
    body.model === 'kimi-k3'
      ? 'moonshotai-k3-required-tool-choice'
      : body.model === 'kimi-k2.7-code' ||
          body.model === 'kimi-k2.7-code-highspeed'
        ? 'moonshotai-k2.7-tool-choice-omitted'
        : 'moonshotai-k2.6-tool-choice-omitted';

  return new Response(JSON.stringify(readFixture(fixture)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const moonshotai = createMoonshotAI({
  apiKey: 'replay-api-key',
  fetch: replayFetch,
});

const ping = tool({
  description: 'Return pong',
  inputSchema: z.object({}),
});

async function callModel({
  modelId,
  toolChoice,
}: {
  modelId: string;
  toolChoice: 'auto' | 'none' | 'required' | { type: 'tool'; toolName: 'ping' };
}) {
  requests.length = 0;
  const result = await generateText({
    model: moonshotai(modelId),
    prompt: 'Call the ping tool.',
    tools: { ping },
    toolChoice,
    maxRetries: 0,
  });

  return { request: requests[0], warnings: result.warnings ?? [] };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const k3 = await callModel({
    modelId: 'kimi-k3',
    toolChoice: 'required',
  });
  assert(
    k3.request.tool_choice === 'required',
    'kimi-k3 must keep tool_choice "required"',
  );
  assert(k3.warnings.length === 0, 'kimi-k3 must not warn');

  const custom = await callModel({
    modelId: 'custom-kimi-model',
    toolChoice: 'required',
  });
  assert(
    custom.request.tool_choice === 'required',
    'unknown custom IDs must keep tool_choice "required"',
  );
  assert(custom.warnings.length === 0, 'unknown custom IDs must not warn');

  for (const [toolChoice, expected] of [
    ['auto', 'auto'],
    ['none', 'none'],
    [
      { type: 'tool', toolName: 'ping' },
      { type: 'function', function: { name: 'ping' } },
    ],
  ] as const) {
    const result = await callModel({
      modelId: 'kimi-k2.6',
      toolChoice,
    });
    assert(
      JSON.stringify(result.request.tool_choice) === JSON.stringify(expected),
      `tool choice ${JSON.stringify(toolChoice)} changed unexpectedly`,
    );
    assert(
      result.warnings.length === 0,
      `tool choice ${JSON.stringify(toolChoice)} must not warn`,
    );
  }

  const rejectedModels: string[] = [];

  for (const modelId of unsupportedModels) {
    try {
      const result = await callModel({
        modelId,
        toolChoice: 'required',
      });

      assert(
        !Object.hasOwn(result.request, 'tool_choice'),
        `${modelId} must omit tool_choice "required"`,
      );
      assert(
        result.warnings.length === 1,
        `${modelId} must return one actionable warning`,
      );

      const warning = result.warnings[0];
      assert(
        warning.type === 'unsupported',
        `${modelId} warning must be unsupported`,
      );
      assert(
        warning.feature.includes('required') &&
          warning.feature.includes(modelId),
        `${modelId} warning must identify the model and required tool choice`,
      );
    } catch (error) {
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 400 &&
        error.message ===
          "tool_choice 'required' is incompatible with thinking enabled"
      ) {
        rejectedModels.push(modelId);
        continue;
      }
      throw error;
    }
  }

  if (rejectedModels.length > 0) {
    throw new Error(
      `ISSUE #19553 REPRODUCED: Moonshot rejected forwarded tool_choice "required" for ${rejectedModels.join(', ')}`,
    );
  }

  console.log(
    'Issue #19553 is fixed: unsupported models omit required and warn.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
