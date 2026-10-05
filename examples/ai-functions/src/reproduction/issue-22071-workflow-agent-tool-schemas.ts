import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { type FlexibleSchema, jsonSchema, streamText, type ToolSet } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import assert from 'node:assert/strict';
import { z } from 'zod/v4';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

type ModelFixture = {
  model: MockLanguageModelV4;
  getCallCount: () => number;
};

function createStopModel(): ModelFixture {
  let callCount = 0;
  return {
    model: new MockLanguageModelV4({
      doStream: async () => {
        callCount++;
        const streamParts: LanguageModelV4StreamPart[] = [
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: 'hi' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ];
        return { stream: convertArrayToReadableStream(streamParts) };
      },
    }),
    getCallCount: () => callCount,
  };
}

function createTwoStepModel(): ModelFixture {
  let callCount = 0;
  return {
    model: new MockLanguageModelV4({
      doStream: async () => {
        callCount++;
        const streamParts: LanguageModelV4StreamPart[] =
          callCount === 1
            ? [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 't',
                  input: JSON.stringify({ id: 'abc' }),
                },
                {
                  type: 'finish',
                  finishReason: {
                    unified: 'tool-calls',
                    raw: 'tool-calls',
                  },
                  usage,
                },
              ]
            : [
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'hi' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ];
        return { stream: convertArrayToReadableStream(streamParts) };
      },
    }),
    getCallCount: () => callCount,
  };
}

function createTools(inputSchema: FlexibleSchema): ToolSet {
  return {
    t: {
      inputSchema,
      execute: async () => 'ok',
    },
  };
}

async function captureWarnings<T>(
  operation: () => Promise<T>,
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  try {
    return { result: await operation(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

async function assertStreamTextAccepts(
  name: string,
  inputSchema: FlexibleSchema,
) {
  const fixture = createStopModel();
  const { result: text, warnings } = await captureWarnings(async () => {
    const result = streamText({
      model: fixture.model,
      prompt: 'hi',
      tools: createTools(inputSchema),
    });
    return result.text;
  });

  assert.equal(text, 'hi', `${name}: streamText should complete`);
  assert.equal(
    fixture.getCallCount(),
    1,
    `${name}: streamText should call the model`,
  );
  assert.deepEqual(warnings, [], `${name}: streamText should not warn`);
}

const xKeywordSchema = {
  type: 'object',
  properties: { q: { type: 'string', 'x-order': 1 } },
} as const;

const exampleKeywordSchema = {
  type: 'object',
  properties: { q: { type: 'string', example: 'search terms' } },
} as const;

const rejectionCases: Array<{
  name: string;
  inputSchema: FlexibleSchema;
  expectedError: string;
}> = [
  {
    name: 'z.email()',
    inputSchema: z.object({ to: z.email() }),
    expectedError: 'unknown format "email" ignored in schema',
  },
  {
    name: 'z.url()',
    inputSchema: z.object({ link: z.url() }),
    expectedError: 'unknown format "uri" ignored in schema',
  },
  {
    name: 'z.uuid()',
    inputSchema: z.object({ id: z.uuid() }),
    expectedError: 'unknown format "uuid" ignored in schema',
  },
  {
    name: 'x-* keyword',
    inputSchema: jsonSchema(xKeywordSchema),
    expectedError: 'strict mode: unknown keyword: "x-order"',
  },
  {
    name: 'example keyword',
    inputSchema: jsonSchema(exampleKeywordSchema),
    expectedError: 'strict mode: unknown keyword: "example"',
  },
  {
    name: '2020-12 $schema',
    inputSchema: jsonSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { q: { type: 'string' } },
    }),
    expectedError:
      'no schema with key or ref "https://json-schema.org/draft/2020-12/schema"',
  },
];

async function main() {
  const primaryFailures: string[] = [];

  for (const testCase of rejectionCases) {
    await assertStreamTextAccepts(testCase.name, testCase.inputSchema);

    const fixture = createStopModel();
    try {
      const { result, warnings } = await captureWarnings(() =>
        new WorkflowAgent({
          model: fixture.model,
          tools: createTools(testCase.inputSchema),
        }).stream({ messages: [{ role: 'user', content: 'hi' }] }),
      );

      assert.equal(
        result.steps.at(-1)?.text,
        'hi',
        `${testCase.name}: WorkflowAgent should complete`,
      );
      assert.equal(
        fixture.getCallCount(),
        1,
        `${testCase.name}: WorkflowAgent should call the model`,
      );
      assert.deepEqual(
        warnings,
        [],
        `${testCase.name}: WorkflowAgent should not warn`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(
        message.includes(testCase.expectedError),
        `${testCase.name}: unexpected WorkflowAgent failure: ${message}`,
      );
      assert.equal(
        fixture.getCallCount(),
        0,
        `${testCase.name}: schema compilation should fail before model dispatch`,
      );
      primaryFailures.push(`${testCase.name}: ${message}`);
    }
  }

  const unionSchema = jsonSchema<{ id: string | number }>({
    type: 'object',
    properties: { id: { type: ['string', 'number'] } },
    required: ['id'],
  });
  await assertStreamTextAccepts('string|number', unionSchema);

  const unionFixture = createTwoStepModel();
  const { result: unionResult, warnings: unionWarnings } =
    await captureWarnings(() =>
      new WorkflowAgent({
        model: unionFixture.model,
        tools: createTools(unionSchema),
      }).stream({ messages: [{ role: 'user', content: 'hi' }] }),
    );
  assert.equal(
    unionResult.steps.at(-1)?.text,
    'hi',
    'string|number: agent should complete',
  );
  assert.equal(
    unionFixture.getCallCount(),
    2,
    'string|number: fixture should execute two model steps',
  );
  assert.ok(
    unionWarnings.every(warning =>
      warning.includes('strict mode: use allowUnionTypes'),
    ),
    `string|number: unexpected warnings: ${unionWarnings.join(' | ')}`,
  );

  if (primaryFailures.length > 0) {
    console.error(
      'ISSUE_22071_REPRODUCED: WorkflowAgent rejected tool schemas accepted by streamText before model dispatch.',
    );
    for (const failure of primaryFailures) {
      console.error(`- ${failure}`);
    }
    console.error(
      `- string|number: ${unionWarnings.length} strictTypes warnings across ${unionFixture.getCallCount()} model steps`,
    );
    process.exitCode = 1;
    return;
  }

  if (unionWarnings.length > 0) {
    console.error(
      'ISSUE_22071_WARNING_REPRODUCED: WorkflowAgent warned once per model step for a valid union type.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'WorkflowAgent accepted all supported tool schemas without per-step warnings.',
  );
}

await main();
