import { readFileSync } from 'node:fs';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

const TASK_SUBTYPES = new Set([
  'background_tasks_changed',
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification',
]);

async function main() {
  const messages = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/harness-claude-code/src/bridge/__fixtures__/issue-21687-subagent-task-stream.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as ClaudeMessage[];
  const emitted: Record<string, unknown>[] = [];
  const emitStreamEvent = createEmitStreamEvent({
    state: createClaudeStreamEventState(),
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: () => {},
    onCompactionBoundary: () => {},
    toCommonName: name => name,
  });

  for (const message of messages) {
    emitStreamEvent(message);
  }

  const parentToolCallVisible = emitted.some(
    event =>
      event.type === 'tool-call' && event.toolCallId === 'toolu_parent_agent',
  );
  if (!parentToolCallVisible) {
    throw new Error(
      'Reproduction setup failed: the parent Agent tool call was not emitted.',
    );
  }

  const expectedRawValues = messages.filter(
    message =>
      message.parent_tool_use_id != null ||
      (message.type === 'system' && TASK_SUBTYPES.has(message.subtype ?? '')),
  );
  const rawValues = emitted
    .filter(event => event.type === 'raw')
    .map(event => event.rawValue);
  const missing = expectedRawValues.filter(
    expected => !rawValues.includes(expected),
  );

  if (missing.length > 0) {
    const missingKinds = missing.map(message =>
      message.parent_tool_use_id != null
        ? `${message.type}[parent_tool_use_id=${message.parent_tool_use_id}]`
        : `system/${message.subtype}`,
    );
    console.error(
      `ISSUE_21687_REPRODUCTION: Harness stream omitted sub-agent/task raw events: ${missingKinds.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #21687 is fixed: all sub-agent and task activity was forwarded as raw parts.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
