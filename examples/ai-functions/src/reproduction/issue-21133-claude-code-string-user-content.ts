import assert from 'node:assert/strict';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

async function main() {
  const state = createClaudeStreamEventState();
  state.stepOpen = true;

  const emitted: Record<string, unknown>[] = [];
  const terminalErrors: Array<string | undefined> = [];
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: error => terminalErrors.push(error),
    onCompactionBoundary: () => {},
    toCommonName: name => name,
  });

  emitStreamEvent({
    type: 'user',
    message: { content: 'Compacted conversation context' },
  });
  emitStreamEvent({
    type: 'tool_progress',
    subtype: 'reproduction-continued-after-string-content',
  });

  assert.deepEqual(terminalErrors, []);
  assert.equal(state.stepOpen, true);
  assert.deepEqual(emitted, [
    { type: 'stream-start' },
    {
      type: 'raw',
      rawValue: {
        type: 'tool_progress',
        subtype: 'reproduction-continued-after-string-content',
      },
    },
  ]);

  console.log(
    'Issue #21133 did not reproduce: string user content was ignored and the next SDK message was processed.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
