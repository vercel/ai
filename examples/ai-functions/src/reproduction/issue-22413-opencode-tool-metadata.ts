import assert from 'node:assert/strict';
import { createEmitStreamEvent } from '../../../../packages/harness-opencode/src/bridge/create-emit-stream-event';
import { createTranslationState } from '../../../../packages/harness-opencode/src/bridge/opencode-events';

async function main() {
  const emitted: Record<string, unknown>[] = [];
  const providerMetadata = {
    openai: { itemId: 'provider-item' },
  };
  const state = createTranslationState();
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitError: () => {},
    toWireToolName: name => name,
    nativeNameField: () => ({}),
    getHostToolName: () => undefined,
    authorizeHostToolCall: () => {},
    isMcpToolName: name => name === 'fixture_read',
    stripWorkDir: file => file,
    formatError: error => String(error),
  });

  const runningPart = {
    type: 'tool',
    callID: 'native-call',
    tool: 'fixture_read',
    metadata: {
      providerItemId: 'observe-1',
      path: 'wrong-part-metadata-path',
    },
    state: {
      status: 'running',
      metadata: {
        billing: 'observation',
        exact: false,
      },
      input: {
        path: 'a.ts',
        exact: true,
      },
    },
    provider: { metadata: providerMetadata },
  };

  emitStreamEvent({
    type: 'message.part.updated',
    properties: { part: runningPart },
  });
  emitStreamEvent({
    type: 'message.part.updated',
    properties: {
      part: {
        ...runningPart,
        state: {
          ...runningPart.state,
          status: 'completed',
          output: 'native result',
        },
      },
    },
  });

  const toolCalls = emitted.filter(event => event.type === 'tool-call');
  const toolResults = emitted.filter(event => event.type === 'tool-result');

  assert.deepEqual(toolCalls, [
    {
      type: 'tool-call',
      toolCallId: 'native-call',
      toolName: 'fixture_read',
      input: toolCalls[0]?.input,
      providerExecuted: true,
      dynamic: true,
      providerMetadata,
    },
  ]);
  assert.deepEqual(toolResults, [
    {
      type: 'tool-result',
      toolCallId: 'native-call',
      toolName: 'fixture_read',
      result: 'native result',
      dynamic: true,
    },
  ]);

  const actualInput = toolCalls[0]?.input;
  const expectedInput = JSON.stringify({ path: 'a.ts', exact: true });
  if (actualInput === expectedInput) {
    return;
  }

  assert.equal(typeof actualInput, 'string');
  const parsedInput = JSON.parse(actualInput);
  assert.deepEqual(
    {
      providerItemId: parsedInput.providerItemId,
      billing: parsedInput.billing,
      path: parsedInput.path,
      exact: parsedInput.exact,
    },
    {
      providerItemId: 'observe-1',
      billing: 'observation',
      path: 'a.ts',
      exact: true,
    },
  );

  throw new Error(
    `ISSUE_22413_REPRODUCED: observation metadata contaminated native MCP tool arguments; expected ${expectedInput}, received ${actualInput}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
