import { createFileReporter } from '@ai-sdk/harness/agent';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateText, jsonSchema } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: { total: 1 },
  outputTokens: { total: 1 },
};

async function check<T extends number | bigint>(value: T) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-reporter-bigint-'));

  try {
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 't1',
              toolName: 'lookup',
              input: '{}',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          warnings: [],
          usage,
        },
      }),
      prompt: 'Test',
      maxRetries: 0,
      tools: {
        lookup: {
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
            additionalProperties: false,
          }),
          execute: () => value,
          toModelOutput: ({ output }) => ({
            type: 'text',
            value: String(output),
          }),
        },
      },
      telemetry: { integrations: [createFileReporter({ dir })] },
    });

    assert.equal(result.toolResults[0]?.output, value);

    const file = join(dir, 'events.jsonl');
    return existsSync(file)
      ? readFileSync(file, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line) as { kind: string })
          .map(record => record.kind)
      : [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const control = await check(42);
  const bigint = await check(42n);

  assert.ok(
    control.includes('turn-finish'),
    'Control turn did not produce turn-finish telemetry',
  );

  if (!bigint.includes('turn-finish')) {
    console.error(
      'ISSUE_23051_REPRODUCED: BigInt tool output discarded all turn telemetry records',
    );
    console.error(JSON.stringify({ control, bigint }));
    process.exitCode = 1;
    return;
  }

  console.log('Issue #23051 did not reproduce.', { control, bigint });
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
