import assert from 'node:assert/strict';

type StreamEventState = Record<string, unknown>;
type ClaudeMessage = { type?: string } & Record<string, unknown>;

type MapperModule = {
  createClaudeStreamEventState: () => StreamEventState;
  createEmitStreamEvent: (options: {
    state: StreamEventState;
    emit: (event: Record<string, unknown>) => void;
    emitWarning: (warning: { message: string }) => void;
    emitTerminalError: (message: string | undefined) => void;
    onCompactionBoundary: (boundary: {
      trigger: 'manual' | 'auto';
      tokensBefore?: number;
      tokensAfter?: number;
    }) => void;
    toCommonName: (nativeName: string) => string;
  }) => (event: ClaudeMessage) => void;
};

const cases = [
  {
    status: 'rejected',
    resetsAt: 1_791_331_200,
    rateLimitType: 'five_hour',
    utilization: 1,
  },
  { status: 'rejected' },
  { status: 'allowed_warning', utilization: 0.95 },
  { status: 'allowed' },
] as const;

async function main() {
  const mapperUrl = new URL(
    '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event.ts',
    import.meta.url,
  );
  const { createClaudeStreamEventState, createEmitStreamEvent } = (await import(
    mapperUrl.href
  )) as MapperModule;

  const droppedStatuses: string[] = [];

  for (const rateLimitInfo of cases) {
    const emitted: Record<string, unknown>[] = [];
    const terminalErrors: Array<string | undefined> = [];
    const message: ClaudeMessage = {
      type: 'rate_limit_event',
      rate_limit_info: rateLimitInfo,
      uuid: '00000000-0000-4000-8000-000000000001',
      session_id: 'test-session',
      additional_metadata: { preserve: true },
    };
    const emitStreamEvent = createEmitStreamEvent({
      state: createClaudeStreamEventState(),
      emit: event => emitted.push(event),
      emitWarning: () => {},
      emitTerminalError: error => terminalErrors.push(error),
      onCompactionBoundary: () => {},
      toCommonName: name => name,
    });

    emitStreamEvent(message);

    assert.deepEqual(
      terminalErrors,
      [],
      `rate_limit_event with status ${rateLimitInfo.status} emitted a terminal error`,
    );

    const expected = [
      { type: 'stream-start' },
      { type: 'raw', rawValue: message },
    ];
    if (
      emitted.length === 1 &&
      emitted[0]?.type === 'stream-start' &&
      !emitted.some(event => event.type === 'raw')
    ) {
      droppedStatuses.push(rateLimitInfo.status);
      continue;
    }
    assert.deepEqual(
      emitted,
      expected,
      `unexpected mapping for rate_limit_event with status ${rateLimitInfo.status}`,
    );
  }

  if (droppedStatuses.length > 0) {
    console.error(
      'ISSUE_22219: rate_limit_event was dropped instead of forwarded as raw',
    );
    console.error(`Dropped statuses: ${droppedStatuses.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('Issue #22219 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
