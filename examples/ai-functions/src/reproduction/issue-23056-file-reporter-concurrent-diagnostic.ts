import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileReporter,
  type HarnessDiagnostic,
} from '@ai-sdk/harness/agent';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-log-correlation-'));

  try {
    const reporter = createFileReporter({ dir, failOnly: true });

    reporter.onStart!({
      callId: 'call-A',
      operationId: 'ai.streamText',
    } as never);
    reporter.onStart!({
      callId: 'call-B',
      operationId: 'ai.streamText',
    } as never);

    reporter.ingestDiagnostic!({
      kind: 'event',
      level: 'error',
      subsystem: 'bridge.turn',
      message: 'A failed operation',
      sessionId: 'session-A',
      timestamp: 1,
    } satisfies HarnessDiagnostic);

    reporter.onEnd!({ callId: 'call-A', finishReason: 'stop' } as never);
    reporter.onEnd!({ callId: 'call-B', finishReason: 'stop' } as never);

    const records = readFileSync(join(dir, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>);
    const retainedCalls = [
      ...new Set(
        records
          .map(record => record.callId)
          .filter((callId): callId is string => typeof callId === 'string'),
      ),
    ];
    const diagnostics = records.filter(record => record.kind === 'diagnostic');

    assert.equal(
      diagnostics.length,
      1,
      'the error diagnostic must be retained for debugging',
    );

    if (retainedCalls.includes('call-B')) {
      console.error(
        'ISSUE_23056_REPRODUCED: an unassociated diagnostic retained the last-started concurrent call-B',
      );
      process.exitCode = 1;
      return;
    }

    console.log({
      retainedCalls,
      diagnostics,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
