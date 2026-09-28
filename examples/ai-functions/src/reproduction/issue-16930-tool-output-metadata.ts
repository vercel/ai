import assert from 'node:assert/strict';
import {
  readUIMessageStream,
  simulateReadableStream,
  type UIMessageChunk,
} from 'ai';

type Scenario = {
  name: string;
  dynamic: boolean;
  result:
    | { type: 'tool-output-available'; output: unknown }
    | { type: 'tool-output-error'; errorText: string };
  inputMetadata?: Record<string, string>;
  outputMetadata: Record<string, string>;
};

class ReproducedBugError extends Error {}

const scenarios: Scenario[] = [
  {
    name: 'dynamic tool-output-available',
    dynamic: true,
    result: { type: 'tool-output-available', output: { ok: true } },
    outputMetadata: { phase: 'dynamic-output-available' },
  },
  {
    name: 'dynamic tool-output-error',
    dynamic: true,
    result: { type: 'tool-output-error', errorText: 'tool failed' },
    inputMetadata: { phase: 'dynamic-input' },
    outputMetadata: { phase: 'dynamic-output-error' },
  },
  {
    name: 'static tool-output-available',
    dynamic: false,
    result: { type: 'tool-output-available', output: { ok: true } },
    outputMetadata: { phase: 'static-output-available' },
  },
  {
    name: 'static tool-output-error',
    dynamic: false,
    result: { type: 'tool-output-error', errorText: 'tool failed' },
    inputMetadata: { phase: 'static-input' },
    outputMetadata: { phase: 'static-output-error' },
  },
];

async function readFinalToolPart(scenario: Scenario) {
  const toolCallId = `call-${scenario.name}`;
  const chunks: UIMessageChunk[] = [
    { type: 'start' },
    {
      type: 'tool-input-start',
      toolCallId,
      toolName: 'myTool',
      dynamic: scenario.dynamic,
      toolMetadata: scenario.inputMetadata,
    },
    {
      type: 'tool-input-available',
      toolCallId,
      toolName: 'myTool',
      input: { q: 1 },
      dynamic: scenario.dynamic,
      toolMetadata: scenario.inputMetadata,
    },
    {
      ...scenario.result,
      toolCallId,
      dynamic: scenario.dynamic,
      toolMetadata: scenario.outputMetadata,
    },
    { type: 'finish' },
  ];

  let lastMessage;
  for await (const message of readUIMessageStream({
    stream: simulateReadableStream({
      chunks,
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
    }),
    terminateOnError: true,
  })) {
    lastMessage = message;
  }

  assert.ok(lastMessage, `${scenario.name}: no UI message was emitted`);
  const toolPart = lastMessage.parts.find(
    part =>
      part.type === (scenario.dynamic ? 'dynamic-tool' : 'tool-myTool') &&
      'toolCallId' in part &&
      part.toolCallId === toolCallId,
  ) as
    | {
        state: string;
        toolMetadata?: unknown;
      }
    | undefined;
  assert.ok(toolPart, `${scenario.name}: final tool part was not emitted`);
  assert.equal(
    toolPart.state,
    scenario.result.type === 'tool-output-available'
      ? 'output-available'
      : 'output-error',
    `${scenario.name}: final tool state was not applied`,
  );

  return toolPart;
}

async function main() {
  const droppedMetadata: string[] = [];

  for (const scenario of scenarios) {
    const toolPart = await readFinalToolPart(scenario);
    try {
      assert.deepEqual(toolPart.toolMetadata, scenario.outputMetadata);
    } catch {
      droppedMetadata.push(
        `${scenario.name} (expected ${JSON.stringify(
          scenario.outputMetadata,
        )}, received ${JSON.stringify(toolPart.toolMetadata)})`,
      );
    }
  }

  if (droppedMetadata.length > 0) {
    throw new ReproducedBugError(
      `ISSUE_16930_REPRODUCED: output chunk toolMetadata was dropped for ${droppedMetadata.join(
        '; ',
      )}`,
    );
  }

  console.log(
    'All tool output chunks propagated toolMetadata to their final UI message parts.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
