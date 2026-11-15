import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import type { HarnessDiagnostic } from './types';
import { createFileReporter } from './file-reporter';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'harness-file-reporter-'));
}

function readLines(dir: string): Array<Record<string, unknown>> {
  const text = readFileSync(join(dir, 'events.jsonl'), 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>);
}

const diag = (over: Partial<HarnessDiagnostic> = {}): HarnessDiagnostic => ({
  level: 'info',
  message: 'sandbox line',
  subsystem: 'sandbox.log.test',
  kind: 'log',
  source: 'test',
  stream: 'stdout',
  sessionId: 's1',
  timestamp: 1,
  ...over,
});

// Minimal event shapes — only the fields the reporter reads.
const startEvent = {
  callId: 'call-1',
  operationId: 'ai.harness',
  modelId: 'm',
  messages: [{ role: 'user', content: 'what is 2+2?' }],
  instructions: 'be terse',
} as never;
const stepStartEvent = { callId: 'call-1', stepNumber: 0 } as never;
const toolStartEvent = {
  callId: 'call-1',
  toolCall: { toolName: 'bash', toolCallId: 'c1', input: '{}' },
} as never;
const toolEndEvent = {
  callId: 'call-1',
  toolCall: { toolCallId: 'c1' },
  toolOutput: { type: 'tool-result', output: { ok: true } },
} as never;
const stepFinishEvent = {
  callId: 'call-1',
  usage: {},
  content: [{ type: 'text', text: '4' }],
} as never;
const endEvent = {
  callId: 'call-1',
  finishReason: 'stop',
  totalUsage: {},
} as never;

describe('createFileReporter', () => {
  test('records error details and flushes the failed turn without onEnd', () => {
    const dir = tmp();
    const reporter = createFileReporter({ dir, failOnly: true });
    reporter.onStart!(startEvent);
    reporter.onError!({ callId: 'call-1', error: new Error('bridge failed') });

    expect(readLines(dir)).toEqual([
      expect.objectContaining({ kind: 'turn-start', callId: 'call-1' }),
      expect.objectContaining({
        kind: 'error',
        callId: 'call-1',
        error: { name: 'Error', message: 'bridge failed' },
      }),
    ]);
  });

  test.each([null, undefined, 'failed', 0, false])(
    'preserves non-Error thrown values: %s',
    error => {
      const dir = tmp();
      const reporter = createFileReporter({ dir });
      reporter.onStart!(startEvent);
      reporter.onError!({ callId: 'call-1', error });
      expect(readLines(dir).find(line => line.kind === 'error')!.error).toEqual(
        error,
      );
    },
  );

  test('settles errors by callId when turns overlap', () => {
    const dir = tmp();
    const reporter = createFileReporter({ dir, failOnly: true });
    reporter.onStart!(startEvent);
    reporter.onStart!({ callId: 'call-2' } as never);
    reporter.onError!({ callId: 'call-1', error: new Error('first failed') });
    reporter.onEnd!({ callId: 'call-2' } as never);

    expect(readLines(dir).map(line => line.callId)).toEqual([
      'call-1',
      'call-1',
    ]);
  });

  test.each([
    { reason: 'user stopped', expectedReason: 'user stopped' },
    {
      reason: new Error('user stopped'),
      expectedReason: { name: 'Error', message: 'user stopped' },
    },
  ])(
    'records an abort and flushes the turn without onEnd: $reason',
    ({ reason, expectedReason }) => {
      const dir = tmp();
      const reporter = createFileReporter({ dir });
      reporter.onStart!(startEvent);
      reporter.onAbort!({ callId: 'call-1', steps: [], reason });

      expect(readLines(dir)).toEqual([
        expect.objectContaining({ kind: 'turn-start', callId: 'call-1' }),
        expect.objectContaining({
          kind: 'turn-abort',
          callId: 'call-1',
          reason: expectedReason,
        }),
      ]);
    },
  );

  test('failOnly skips a clean aborted turn and flushes an errored aborted turn', () => {
    const dir = tmp();
    const reporter = createFileReporter({ dir, failOnly: true });
    reporter.onStart!(startEvent);
    reporter.onAbort!({ callId: 'call-1', steps: [] });
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(false);

    reporter.onStart!({ callId: 'call-2' } as never);
    reporter.ingestDiagnostic!(diag({ level: 'error', message: 'boom' }));
    reporter.onAbort!({ callId: 'call-2', steps: [] });
    expect(readLines(dir).map(line => line.kind)).toEqual([
      'turn-start',
      'diagnostic',
      'turn-abort',
    ]);
  });

  test('writes a unified, non-lossy events.jsonl with spans AND diagnostics', () => {
    const dir = tmp();
    const reporter = createFileReporter({ dir });

    reporter.onStart!(startEvent);
    reporter.onStepStart!(stepStartEvent);
    reporter.ingestDiagnostic!(diag({ message: 'hello from sandbox' }));
    reporter.onToolExecutionStart!(toolStartEvent);
    reporter.onToolExecutionEnd!(toolEndEvent);
    reporter.onStepFinish!(stepFinishEvent);
    reporter.onEnd!(endEvent);

    const lines = readLines(dir);
    const kinds = lines.map(l => l.kind);
    expect(kinds).toEqual([
      'turn-start',
      'step-start',
      'diagnostic',
      'tool-start',
      'tool-end',
      'step-finish',
      'turn-finish',
    ]);

    // The diagnostic survived intact alongside the spans (non-lossy).
    const d = lines.find(l => l.kind === 'diagnostic');
    expect(d).toBeDefined();
    const captured = d!.diagnostic as HarnessDiagnostic;
    expect(captured.message).toBe('hello from sandbox');

    // Input prompt is captured on turn-start, output content on step-finish.
    const turnStart = lines.find(l => l.kind === 'turn-start');
    expect((turnStart!.input as { messages: unknown[] }).messages).toEqual([
      { role: 'user', content: 'what is 2+2?' },
    ]);
    const stepFinish = lines.find(l => l.kind === 'step-finish');
    expect(stepFinish!.output).toEqual([{ type: 'text', text: '4' }]);
  });

  test('recordInputs/recordOutputs: false suppress message content', () => {
    const dir = tmp();
    const reporter = createFileReporter({ dir });
    reporter.onStart!({
      ...(startEvent as object),
      recordInputs: false,
    } as never);
    reporter.onStepStart!(stepStartEvent);
    reporter.onStepFinish!({
      ...(stepFinishEvent as object),
      recordOutputs: false,
    } as never);
    reporter.onEnd!(endEvent);

    const lines = readLines(dir);
    expect(lines.find(l => l.kind === 'turn-start')!.input).toBeUndefined();
    expect(lines.find(l => l.kind === 'step-finish')!.output).toBeUndefined();
  });

  test('failOnly skips a clean turn but writes a turn that errored', () => {
    const dir = tmp();
    const reporter = createFileReporter({ dir, failOnly: true });

    // Clean turn — nothing should be written.
    reporter.onStart!(startEvent);
    reporter.onStepStart!(stepStartEvent);
    reporter.onStepFinish!(stepFinishEvent);
    reporter.onEnd!(endEvent);
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(false);

    // Errored turn — flushed on end.
    const errCall = {
      callId: 'call-2',
      operationId: 'ai.harness',
      modelId: 'm',
    } as never;
    reporter.onStart!(errCall);
    reporter.ingestDiagnostic!(diag({ level: 'error', message: 'boom' }));
    reporter.onEnd!({
      callId: 'call-2',
      finishReason: 'error',
      totalUsage: {},
    } as never);

    const lines = readLines(dir);
    expect(lines.some(l => l.kind === 'diagnostic')).toBe(true);
    expect(
      lines.every(l => l.callId === 'call-2' || l.kind === 'diagnostic'),
    ).toBe(true);
  });
});
