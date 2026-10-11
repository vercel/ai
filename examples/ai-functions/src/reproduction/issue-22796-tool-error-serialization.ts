import type { ToolModelMessage } from '@ai-sdk/provider-utils';
import { generateText, jsonSchema, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import assert from 'node:assert/strict';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

const model = new MockLanguageModelV4({
  doGenerate: {
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: '{}',
      },
    ],
    warnings: [],
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage,
  },
});

type Case = {
  label: string;
  thrown: unknown;
};

type ReplacementSerializationFailure = {
  label: string;
  name: string;
  message: string;
};

function assertReadableToolError(message: ToolModelMessage, label: string) {
  const part = message.content[0];
  assert.equal(part?.type, 'tool-result', `${label}: missing tool result`);

  const output = part.output;
  assert.equal(output.type, 'error-text', `${label}: not an error-text result`);
  assert.equal(
    typeof output.value,
    'string',
    `${label}: error-text value is not a string`,
  );
  assert.ok(output.value.length > 0, `${label}: error-text value is empty`);
}

function isReportedReplacementError(
  error: unknown,
  label: string,
): error is TypeError {
  if (!(error instanceof TypeError)) {
    return false;
  }

  return label === 'cyclic object'
    ? error.message.includes('circular')
    : label === 'BigInt'
      ? error.message.includes('BigInt')
      : false;
}

async function main() {
  const cyclic: { message: string; self?: unknown } = {
    message: 'lookup failed',
  };
  cyclic.self = cyclic;

  const cases: Case[] = [
    { label: 'Error control', thrown: new Error('control') },
    { label: 'cyclic object', thrown: cyclic },
    { label: 'BigInt', thrown: 1n },
  ];
  const replacementFailures: ReplacementSerializationFailure[] = [];

  for (const testCase of cases) {
    try {
      const result = await generateText({
        model,
        prompt: 'test',
        tools: {
          lookup: tool({
            inputSchema: jsonSchema<Record<string, never>>({
              type: 'object',
            }),
            execute(): string {
              throw testCase.thrown;
            },
          }),
        },
      });

      const message = result.response.messages.at(-1);
      assert.equal(
        message?.role,
        'tool',
        `${testCase.label}: missing tool response message`,
      );
      assertReadableToolError(message, testCase.label);
    } catch (error) {
      if (!isReportedReplacementError(error, testCase.label)) {
        throw error;
      }

      replacementFailures.push({
        label: testCase.label,
        name: error.name,
        message: error.message,
      });
    }
  }

  if (replacementFailures.length > 0) {
    console.error(JSON.stringify(replacementFailures, null, 2));
    throw new Error(
      `ISSUE_22796_REPRODUCED: generateText replaced tool failures with serialization errors for ${replacementFailures.map(failure => failure.label).join(' and ')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
