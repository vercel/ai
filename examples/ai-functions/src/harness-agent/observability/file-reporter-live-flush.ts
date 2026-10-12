import { createFileReporter } from '@ai-sdk/harness/agent';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ai-harness-live-log-'));
const reporter = createFileReporter({ dir, failOnly: false });
const eventsPath = join(dir, 'events.jsonl');
let activeRecordCount = 0;

try {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      for (let index = 0; index < 1000; index++) {
        reporter.ingestDiagnostic?.({
          kind: 'log',
          level: 'info',
          subsystem: 'sandbox.log.stdout',
          message: `progress ${index}`,
          sessionId: 'synthetic',
          timestamp: index,
        });
      }

      activeRecordCount = readFileSync(eventsPath, 'utf8')
        .split('\n')
        .filter(Boolean).length;
      assert.ok(
        activeRecordCount > 0,
        'records should be visible before the turn finishes',
      );

      return {
        content: [{ type: 'text', text: 'done' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
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
        },
        warnings: [],
      };
    },
  });

  await generateText({
    model,
    prompt: 'Run a synthetic long turn.',
    telemetry: {
      integrations: [reporter],
    },
  });

  const completedRecordCount = readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter(Boolean).length;

  console.log({ activeRecordCount, completedRecordCount, eventsPath });
  assert.ok(completedRecordCount > activeRecordCount);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
