import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

type FrameWithToolUseResult = ClaudeMessage & { tool_use_result?: unknown };

const failureSignal =
  'ISSUE_19894_REPRODUCED: Claude Code bridge emitted model-facing tool_result text instead of the structured tool_use_result Output';

function containsEqual(value: unknown, expected: unknown): boolean {
  if (JSON.stringify(value) === JSON.stringify(expected)) return true;
  if (Array.isArray(value)) {
    return value.some(item => containsEqual(item, expected));
  }
  if (value != null && typeof value === 'object') {
    return Object.values(value).some(item => containsEqual(item, expected));
  }
  return false;
}

async function main() {
  const messages = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/harness-claude-code/src/bridge/__fixtures__/tool-use-result-stream.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as FrameWithToolUseResult[];
  const state = createClaudeStreamEventState();
  const emitted: Record<string, unknown>[] = [];
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: () => {},
    onCompactionBoundary: () => {},
    toCommonName: name =>
      name === 'Read' ? 'read' : name === 'Bash' ? 'bash' : name,
  });

  for (const message of messages) {
    emitStreamEvent(message);
  }

  const toolResults = emitted.filter(event => event.type === 'tool-result');
  const taskOutput = { task: { id: '1', subject: 'probe-task' } };
  const readOutput = {
    type: 'text',
    file: {
      filePath:
        '/work/packages/harness-claude-code/src/bridge/__fixtures__/tool-use-result-input.txt',
      content: 'alpha\nbeta\ngamma\n',
      numLines: 4,
      startLine: 1,
      totalLines: 4,
    },
  };
  const bashOutput = {
    stdout: 'hello-stdouthello-stderr',
    stderr: '',
    interrupted: false,
    isImage: false,
    noOutputExpected: false,
  };

  const exposesStructuredOutputs =
    containsEqual(toolResults, taskOutput) &&
    containsEqual(toolResults, readOutput) &&
    containsEqual(toolResults, bashOutput);

  if (!exposesStructuredOutputs) {
    const taskResult = toolResults.find(
      event => event.toolName === 'TaskCreate',
    )?.result;
    const readResult = toolResults.find(
      event => event.toolName === 'read',
    )?.result;
    const bashResult = toolResults.find(
      event => event.toolName === 'bash' && event.isError === false,
    )?.result;
    const observedReportedBug =
      taskResult === 'Task #1 created successfully: probe-task' &&
      readResult === '1\talpha\n2\tbeta\n3\tgamma\n4\t' &&
      JSON.stringify(bashResult) ===
        JSON.stringify({
          exitCode: 0,
          stdout: 'hello-stdouthello-stderr',
        });

    if (observedReportedBug) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }
  }

  assert.ok(
    containsEqual(toolResults, taskOutput),
    'TaskCreate structured output was not exposed on its tool-result event',
  );
  assert.ok(
    containsEqual(toolResults, readOutput),
    'Read structured output was not exposed on its tool-result event',
  );
  assert.ok(
    containsEqual(toolResults, bashOutput),
    'Bash structured output was not exposed on its tool-result event',
  );
}

main();
