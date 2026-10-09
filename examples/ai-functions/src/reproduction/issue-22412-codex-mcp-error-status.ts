import assert from 'node:assert/strict';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { translateStreamPart } from '../../../../packages/harness/src/agent/internal/translate-stream-part';
import type { HarnessV1StreamPart } from '../../../../packages/harness/src/v1';
import type { CodexStepTracker } from '../../../../packages/harness-codex/src/bridge/codex-step-tracker';
import { createEmitStreamEvent } from '../../../../packages/harness-codex/src/bridge/create-emit-stream-event';

const failureSignal =
  'ISSUE #22412 REPRODUCED: failed native MCP calls were translated as successful tool-result events.';

function withoutIsError(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...event };
  delete copy.isError;
  return copy;
}

async function main(): Promise<void> {
  const emitted: Record<string, unknown>[] = [];
  const emitStreamEvent = createEmitStreamEvent({
    send: event => emitted.push(event),
    stepTracker: {
      observeEvent() {},
      finishTurn() {},
    } as CodexStepTracker,
    setTurnUsage() {},
    setThreadId() {},
    emitWarning() {},
    emitError() {},
  });

  const items = [
    {
      type: 'mcp_tool_call',
      id: 'failed',
      server: 'fixture',
      tool: 'fail',
      arguments: { exact: true },
    },
    {
      type: 'mcp_tool_call',
      id: 'success',
      server: 'fixture',
      tool: 'ok',
      arguments: {},
    },
    {
      type: 'mcp_tool_call',
      id: 'empty-failure',
      server: 'fixture',
      tool: 'fail',
      arguments: {},
    },
  ];

  for (const item of items) {
    emitStreamEvent({ type: 'item.started', item });
  }

  emitStreamEvent({
    type: 'item.completed',
    item: {
      ...items[1],
      status: 'completed',
      result: { structured_content: { ok: true } },
    },
  });
  emitStreamEvent({
    type: 'item.completed',
    item: {
      ...items[0],
      status: 'failed',
      error: { message: 'native failure' },
    },
  });
  emitStreamEvent({
    type: 'item.completed',
    item: { ...items[2], status: 'failed' },
  });

  const toolCalls = emitted.filter(event => event.type === 'tool-call');
  assert.deepEqual(toolCalls, [
    {
      type: 'tool-call',
      toolCallId: 'failed',
      toolName: 'mcp__fixture__fail',
      nativeName: 'mcp__fixture__fail',
      input: '{"exact":true}',
      providerExecuted: true,
      dynamic: true,
    },
    {
      type: 'tool-call',
      toolCallId: 'success',
      toolName: 'mcp__fixture__ok',
      nativeName: 'mcp__fixture__ok',
      input: '{}',
      providerExecuted: true,
      dynamic: true,
    },
    {
      type: 'tool-call',
      toolCallId: 'empty-failure',
      toolName: 'mcp__fixture__fail',
      nativeName: 'mcp__fixture__fail',
      input: '{}',
      providerExecuted: true,
      dynamic: true,
    },
  ]);

  const toolResults = emitted.filter(event => event.type === 'tool-result');
  assert.equal(toolResults.length, 3);
  assert.deepEqual(toolResults[0], {
    type: 'tool-result',
    toolCallId: 'success',
    toolName: 'mcp__fixture__ok',
    result: { ok: true },
    dynamic: true,
  });
  assert.deepEqual(withoutIsError(toolResults[1]), {
    type: 'tool-result',
    toolCallId: 'failed',
    toolName: 'mcp__fixture__fail',
    result: { error: 'native failure' },
    dynamic: true,
  });
  assert.deepEqual(withoutIsError(toolResults[2]), {
    type: 'tool-result',
    toolCallId: 'empty-failure',
    toolName: 'mcp__fixture__fail',
    result: null,
    dynamic: true,
  });

  const failedResults = toolResults.slice(1);
  const translatedTypes = failedResults.map(result =>
    translateStreamPart<ToolSet>(result as HarnessV1StreamPart).map(
      part => part.type,
    ),
  );

  if (
    failedResults.some(result => result.isError !== true) ||
    translatedTypes.some(types => !types.includes('tool-error'))
  ) {
    throw new Error(failureSignal);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
