import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { Chat } from '../../../../packages/react/src/index';

function assistantToolMessage() {
  return {
    id: 'assistant-1',
    role: 'assistant' as const,
    parts: [
      {
        type: 'dynamic-tool' as const,
        toolName: 'test-tool',
        toolCallId: 'call-1',
        state: 'input-available' as const,
        input: { value: 'test' },
      },
    ],
  };
}

async function main() {
  const control = new Chat({
    id: 'control',
    messages: [assistantToolMessage()],
  });

  await control.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'call-1',
    output: { ok: true },
  });

  const controlPart = control.messages[0]?.parts[0];
  assert.equal(controlPart?.type, 'dynamic-tool');
  assert.equal(controlPart.state, 'output-available');
  assert.deepEqual(controlPart.output, { ok: true });

  const laterMessage = {
    id: 'user-2',
    role: 'user' as const,
    parts: [
      {
        type: 'text' as const,
        text: 'Continue while the tool runs.',
      },
    ],
  };
  const chat = new Chat({
    id: 'repro',
    messages: [assistantToolMessage(), laterMessage],
  });

  await chat.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'call-1',
    output: { ok: true },
  });

  const earlierPart = chat.messages[0]?.parts[0];
  assert.equal(earlierPart?.type, 'dynamic-tool');

  if (
    earlierPart.state !== 'output-available' ||
    !('output' in earlierPart) ||
    !isDeepStrictEqual(earlierPart.output, { ok: true })
  ) {
    throw new Error(
      `ISSUE_22355: addToolOutput did not update earlier matching tool call (state=${earlierPart.state}, output=${JSON.stringify('output' in earlierPart ? earlierPart.output : undefined)})`,
    );
  }

  assert.deepEqual(chat.messages[1], laterMessage);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
