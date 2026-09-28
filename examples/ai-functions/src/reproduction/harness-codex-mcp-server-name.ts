import { createEmitStreamEvent } from '../../../../packages/harness-codex/src/bridge/create-emit-stream-event';
import type { CodexStepTracker } from '../../../../packages/harness-codex/src/bridge/codex-step-tracker';

type EmittedEvent = Record<string, unknown>;

function preservesServerIdentity({
  event,
  server,
  tool,
}: {
  event: EmittedEvent;
  server: string;
  tool: string;
}): boolean {
  const qualifiedName = `mcp__${server}__${tool}`;

  return Object.entries(event).some(
    ([key, value]) =>
      key !== 'toolCallId' && (value === server || value === qualifiedName),
  );
}

async function main(): Promise<void> {
  const emitted: EmittedEvent[] = [];
  const stepTracker = {
    observeEvent: () => {},
    finishTurn: () => {},
  } as CodexStepTracker;
  const emitStreamEvent = createEmitStreamEvent({
    send: event => emitted.push(event),
    stepTracker,
    setTurnUsage: () => {},
    setThreadId: () => {},
    emitWarning: () => {},
    emitError: () => {},
  });

  for (const server of ['context7', 'internal-docs']) {
    emitStreamEvent({
      type: 'item.started',
      item: {
        type: 'mcp_tool_call',
        id: `${server}-call`,
        server,
        tool: 'query-docs',
        arguments: {},
      },
    });
  }

  emitStreamEvent({
    type: 'item.started',
    item: {
      type: 'mcp_tool_call',
      id: 'serverless-call',
      tool: 'query-docs',
      arguments: {},
    },
  });

  const toolCalls = emitted.filter(event => event.type === 'tool-call');
  if (toolCalls.length !== 3) {
    throw new Error(
      `Expected 3 tool-call parts, received ${toolCalls.length}.`,
    );
  }

  const missingServers = ['context7', 'internal-docs'].filter(
    (server, index) =>
      !preservesServerIdentity({
        event: toolCalls[index],
        server,
        tool: 'query-docs',
      }),
  );

  if (missingServers.length > 0) {
    console.error(
      'ISSUE #21582 REPRODUCED: MCP tool-call parts do not preserve their server identity.',
    );
    console.error(JSON.stringify(toolCalls, null, 2));
    process.exitCode = 1;
    return;
  }

  const serverlessCall = toolCalls[2];
  if (
    serverlessCall.toolName !== 'query-docs' ||
    serverlessCall.nativeName !== 'query-docs'
  ) {
    throw new Error(
      'An MCP tool call without a server did not retain the bare tool name.',
    );
  }

  console.log('MCP tool-call parts preserve distinct server identities.');
}

await main();
