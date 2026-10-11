import { toUIMessageStream } from '@ai-sdk/langchain';
import assert from 'node:assert/strict';
import { readUIMessageStream, type DynamicToolUIPart } from 'ai';

const failureSignal =
  'ISSUE_22800: completed UI tool parts lost streamEvents on_tool_start data.input';

class ReproducedBugError extends Error {}

async function* source() {
  yield {
    event: 'on_tool_start',
    run_id: 'object-call',
    name: 'lookup',
    data: { input: { city: 'Paris' } },
  };
  yield {
    event: 'on_tool_start',
    run_id: 'scalar-call',
    name: 'lookupById',
    data: { input: 42 },
  };
  yield {
    event: 'on_tool_start',
    run_id: 'absent-call',
    name: 'refresh',
    data: {},
  };
  yield {
    event: 'on_tool_end',
    run_id: 'scalar-call',
    name: 'lookupById',
    data: { output: 'record 42' },
  };
  yield {
    event: 'on_tool_end',
    run_id: 'object-call',
    name: 'lookup',
    data: { output: 'sunny' },
  };
  yield {
    event: 'on_tool_end',
    run_id: 'absent-call',
    name: 'refresh',
    data: { output: 'done' },
  };
}

function getCompletedToolPart(
  parts: readonly unknown[],
  toolCallId: string,
  output: unknown,
): DynamicToolUIPart {
  const part = parts.find(
    (part): part is DynamicToolUIPart =>
      typeof part === 'object' &&
      part != null &&
      'type' in part &&
      part.type === 'dynamic-tool' &&
      'toolCallId' in part &&
      part.toolCallId === toolCallId,
  );

  assert.ok(part, `missing dynamic-tool part for ${toolCallId}`);
  assert.equal(part.state, 'output-available');
  assert.deepEqual(part.output, output);
  return part;
}

function assertPreservedInput(part: DynamicToolUIPart, expectedInput: unknown) {
  try {
    assert.deepEqual(part.input, expectedInput);
  } catch (error) {
    if (error instanceof assert.AssertionError) {
      throw new ReproducedBugError();
    }
    throw error;
  }
}

async function main() {
  let finalMessage;

  for await (const message of readUIMessageStream({
    stream: toUIMessageStream(
      source() as unknown as Parameters<typeof toUIMessageStream>[0],
    ),
  })) {
    finalMessage = message;
  }

  assert.ok(finalMessage, 'UI message stream produced no message');

  const objectPart = getCompletedToolPart(
    finalMessage.parts,
    'object-call',
    'sunny',
  );
  const scalarPart = getCompletedToolPart(
    finalMessage.parts,
    'scalar-call',
    'record 42',
  );
  const absentPart = getCompletedToolPart(
    finalMessage.parts,
    'absent-call',
    'done',
  );

  assert.equal(absentPart.input, undefined);

  const droppedInputs: string[] = [];
  for (const [label, part, expectedInput] of [
    ['object-call', objectPart, { city: 'Paris' }],
    ['scalar-call', scalarPart, 42],
  ] as const) {
    try {
      assertPreservedInput(part, expectedInput);
    } catch (error) {
      if (!(error instanceof ReproducedBugError)) throw error;
      droppedInputs.push(label);
    }
  }

  if (droppedInputs.length > 0) {
    throw new ReproducedBugError(droppedInputs.join(', '));
  }

  console.log('Issue #22800 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(`${failureSignal}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
