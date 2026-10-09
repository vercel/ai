import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  jsonSchema,
  type FlexibleSchema,
  type StandardJSONSchemaV1,
  type StandardSchemaV1,
} from '@ai-sdk/provider-utils';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { z } from 'zod/v4';

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const notCalled = Symbol('not-called');

type TestCase = {
  name: string;
  inputSchema: FlexibleSchema<any>;
  input: string;
  expected: unknown | typeof notCalled;
  checkApproval?: boolean;
};

const tagJsonSchema = {
  type: 'object' as const,
  properties: { tag: { type: 'string' as const } },
  required: ['tag'],
};

const customStandardSchema: StandardSchemaV1<unknown, { tag: string }> &
  StandardJSONSchemaV1<unknown, { tag: string }> = {
  '~standard': {
    version: 1,
    vendor: 'issue-22373-reproduction',
    validate: async value =>
      typeof value === 'object' &&
      value != null &&
      'tag' in value &&
      typeof value.tag === 'string'
        ? { value: { tag: value.tag.toUpperCase() } }
        : { issues: [{ message: 'tag must be a string' }] },
    jsonSchema: {
      input: () => tagJsonSchema,
      output: () => tagJsonSchema,
    },
  },
};

const cases: TestCase[] = [
  {
    name: 'Zod default and transform (including needsApproval)',
    inputSchema: z.object({
      q: z.string(),
      limit: z.number().default(10),
      tag: z.string().transform(value => value.toUpperCase()),
    }),
    input: '{"q":"shoes","tag":"sale"}',
    expected: { q: 'shoes', limit: 10, tag: 'SALE' },
    checkApproval: true,
  },
  {
    name: 'Zod refinement',
    inputSchema: z.object({
      path: z
        .string()
        .refine(value => value.startsWith('/'), 'path must be absolute'),
    }),
    input: '{"path":"etc/hosts"}',
    expected: notCalled,
  },
  {
    name: 'Zod top-level unknown-key stripping',
    inputSchema: z.object({ command: z.string() }),
    input: '{"command":"ls","timeout":5}',
    expected: { command: 'ls' },
  },
  {
    name: 'Zod array-item unknown-key stripping',
    inputSchema: z.object({
      edits: z.array(z.object({ path: z.string(), text: z.string() })),
    }),
    input:
      '{"edits":[{"path":"/a","text":"one","timeout":5},{"path":"/b","text":"two","timeout":10}]}',
    expected: {
      edits: [
        { path: '/a', text: 'one' },
        { path: '/b', text: 'two' },
      ],
    },
  },
  {
    name: 'Zod union-member unknown-key stripping',
    inputSchema: z.union([
      z.object({ kind: z.literal('shell'), command: z.string() }),
      z.object({ kind: z.literal('fetch'), url: z.string() }),
    ]),
    input: '{"kind":"shell","command":"ls","timeout":5}',
    expected: { kind: 'shell', command: 'ls' },
  },
  {
    name: 'Zod coercion',
    inputSchema: z.object({ delay: z.coerce.number() }),
    input: '{"delay":"5000"}',
    expected: { delay: 5000 },
  },
  {
    name: 'Zod strict-object rejection',
    inputSchema: z.strictObject({ command: z.string() }),
    input: '{"command":"ls","timeout":5}',
    expected: notCalled,
  },
  {
    name: 'jsonSchema custom validator transform',
    inputSchema: jsonSchema<{ tag: string }>(tagJsonSchema, {
      validate: value =>
        typeof value === 'object' &&
        value != null &&
        'tag' in value &&
        typeof value.tag === 'string'
          ? { success: true, value: { tag: value.tag.toUpperCase() } }
          : { success: false, error: new Error('tag must be a string') },
    }),
    input: '{"tag":"sale"}',
    expected: { tag: 'SALE' },
  },
  {
    name: 'Standard Schema transform',
    inputSchema: customStandardSchema,
    input: '{"tag":"sale"}',
    expected: { tag: 'SALE' },
  },
];

function createModel(toolName: string, input: string) {
  let call = 0;

  return new MockLanguageModelV4({
    doStream: async () => {
      const parts: LanguageModelV4StreamPart[] =
        call++ === 0
          ? [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName,
                input,
              },
              {
                type: 'finish',
                finishReason: {
                  unified: 'tool-calls',
                  raw: 'tool_calls',
                },
                usage,
              },
            ]
          : [
              { type: 'text-start', id: 'text-1' },
              {
                type: 'text-delta',
                id: 'text-1',
                delta: 'done',
              },
              { type: 'text-end', id: 'text-1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage,
              },
            ];

      return { stream: convertArrayToReadableStream(parts) };
    },
  });
}

async function runCase(
  lane: 'streamText' | 'WorkflowAgent',
  testCase: TestCase,
) {
  let executeInput: unknown | typeof notCalled = notCalled;
  let approvalInput: unknown | typeof notCalled = notCalled;

  const tools = {
    testTool: tool({
      inputSchema: testCase.inputSchema,
      needsApproval: testCase.checkApproval
        ? async input => {
            approvalInput = input;
            return false;
          }
        : undefined,
      execute: async input => {
        executeInput = input;
        return 'executed';
      },
    }),
  };

  if (lane === 'streamText') {
    await streamText({
      model: createModel('testTool', testCase.input),
      tools,
      prompt: 'Call the tool.',
      stopWhen: stepCountIs(2),
    }).consumeStream();
  } else {
    await new WorkflowAgent({
      model: createModel('testTool', testCase.input),
      tools,
    }).stream({
      prompt: 'Call the tool.',
      stopWhen: stepCountIs(2),
    });
  }

  return { executeInput, approvalInput };
}

function format(value: unknown | typeof notCalled): string {
  return value === notCalled ? '(not called)' : JSON.stringify(value);
}

function equal(
  actual: unknown | typeof notCalled,
  expected: unknown | typeof notCalled,
): boolean {
  return format(actual) === format(expected);
}

async function main() {
  const baselineFailures: string[] = [];
  const workflowFailures: string[] = [];

  for (const testCase of cases) {
    const baseline = await runCase('streamText', testCase);
    if (!equal(baseline.executeInput, testCase.expected)) {
      baselineFailures.push(
        `${testCase.name}: execute received ${format(baseline.executeInput)}, expected ${format(testCase.expected)}`,
      );
    }
    if (
      testCase.checkApproval &&
      !equal(baseline.approvalInput, testCase.expected)
    ) {
      baselineFailures.push(
        `${testCase.name}: needsApproval received ${format(baseline.approvalInput)}, expected ${format(testCase.expected)}`,
      );
    }

    const workflow = await runCase('WorkflowAgent', testCase);
    console.log(
      `${testCase.name}: WorkflowAgent execute=${format(workflow.executeInput)}` +
        (testCase.checkApproval
          ? ` needsApproval=${format(workflow.approvalInput)}`
          : ''),
    );
    if (!equal(workflow.executeInput, testCase.expected)) {
      workflowFailures.push(
        `${testCase.name}: execute received ${format(workflow.executeInput)}, expected ${format(testCase.expected)}`,
      );
    }
    if (
      testCase.checkApproval &&
      !equal(workflow.approvalInput, testCase.expected)
    ) {
      workflowFailures.push(
        `${testCase.name}: needsApproval received ${format(workflow.approvalInput)}, expected ${format(testCase.expected)}`,
      );
    }
  }

  if (baselineFailures.length > 0) {
    throw new Error(
      `REPRODUCTION HARNESS ERROR: streamText baseline did not apply schemas:\n${baselineFailures.join('\n')}`,
    );
  }

  if (workflowFailures.length > 0) {
    console.error(
      `ISSUE #22373 REPRODUCED: WorkflowAgent did not apply the tool's own inputSchema\n${workflowFailures.join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    "Issue #22373 is not reproducible: WorkflowAgent applied every tool's own inputSchema.",
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
