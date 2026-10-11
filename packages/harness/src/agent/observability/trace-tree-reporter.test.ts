import { describe, expect, test, vi } from 'vitest';
import { createTraceTreeReporter } from './trace-tree-reporter';

const startEvent = {
  callId: 'call-1',
  operationId: 'ai.generateText',
  modelId: 'mock',
} as never;
const stepStartEvent = { callId: 'call-1', stepNumber: 0 } as never;
const toolStartEvent = {
  callId: 'call-1',
  toolCall: { toolName: 'weather', toolCallId: 'tool-1' },
} as never;

function setupReporter() {
  let trace = '';
  const reporter = createTraceTreeReporter({
    write: chunk => {
      trace += chunk;
    },
  });

  reporter.onStart!(startEvent);
  reporter.onStepStart!(stepStartEvent);
  reporter.onToolExecutionStart!(toolStartEvent);

  return {
    reporter,
    getTrace: () => trace,
  };
}

describe('createTraceTreeReporter', () => {
  test('renders completed turns', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(150);
    const { reporter, getTrace } = setupReporter();

    reporter.onEnd!({ callId: 'call-1' } as never);

    expect(getTrace()).toBe(`
- ai.generateText mock 50ms
  - step 1 40ms
    - tool weather 30ms
`);
  });

  test('renders and settles failed turns', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(150);
    const { reporter, getTrace } = setupReporter();

    reporter.onError!({
      callId: 'call-1',
      error: new Error('provider failed'),
    });
    reporter.onEnd!({ callId: 'call-1' } as never);

    expect(getTrace()).toBe(`
- ai.generateText mock [error] 50ms
  - step 1 40ms
    - tool weather 30ms
`);
  });

  test('renders and settles aborted turns', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(120)
      .mockReturnValueOnce(150);
    const { reporter, getTrace } = setupReporter();

    reporter.onAbort!({ callId: 'call-1', steps: [] });
    reporter.onError!({
      callId: 'call-1',
      error: new Error('late error'),
    });

    expect(getTrace()).toBe(`
- ai.generateText mock [aborted] 50ms
  - step 1 40ms
    - tool weather 30ms
`);
  });
});
