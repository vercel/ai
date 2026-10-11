import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { generateText, jsonSchema } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-reporter-repro-'));

  try {
    let trace = '';
    let observedType: string | undefined;

    await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              type: 'tool-call',
              toolCallId: 't1',
              toolName: 'fail',
              input: '{}',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
          warnings: [],
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      }),
      prompt: 'Use the test tool',
      maxRetries: 0,
      tools: {
        fail: {
          inputSchema: jsonSchema({
            type: 'object',
            properties: {},
          }),
          execute: () => {
            throw new Error('synthetic tool failure');
          },
        },
      },
      telemetry: {
        integrations: [
          createFileReporter({ dir, failOnly: true }),
          createTraceTreeReporter({
            write: chunk => {
              trace += chunk;
            },
          }),
          {
            onToolExecutionEnd(event) {
              observedType = event.toolOutput.type;
            },
          },
        ],
      },
    });

    const eventsPath = join(dir, 'events.jsonl');
    const fileWritten = existsSync(eventsPath);
    const records = fileWritten ? readFileSync(eventsPath, 'utf8') : undefined;

    assert.equal(
      observedType,
      'tool-error',
      'the throwing tool must emit the expected telemetry event',
    );

    const failures = [
      ...(fileWritten
        ? []
        : ['failOnly discarded the turn containing a failed tool']),
      ...(trace.includes('[error]')
        ? []
        : ['trace tree omitted the failed-tool [error] marker']),
    ];

    if (failures.length > 0) {
      console.error(`HARNESS_TOOL_ERROR_REPORTER_BUG: ${failures.join('; ')}`);
      console.error(
        JSON.stringify({ observedType, fileWritten, trace, records }),
      );
      process.exitCode = 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
