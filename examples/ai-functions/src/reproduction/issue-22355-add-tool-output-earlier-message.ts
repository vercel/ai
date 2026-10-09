import type { UIMessage } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.js';

function isExpectedOutput(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    'ok' in output &&
    output.ok === true
  );
}

function assistantToolMessage(): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolName: 'test-tool',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { value: 'test' },
      },
    ],
  };
}

async function main() {
  const control = new Chat<UIMessage>({
    id: 'control',
    messages: [assistantToolMessage()],
  });

  await control.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'call-1',
    output: { ok: true },
  });

  const controlPart = control.messages[0].parts[0];
  if (
    controlPart.type !== 'dynamic-tool' ||
    controlPart.state !== 'output-available' ||
    !isExpectedOutput(controlPart.output)
  ) {
    throw new Error(
      'CONTROL_FAILED: addToolOutput did not update the latest message',
    );
  }

  const chat = new Chat<UIMessage>({
    id: 'repro',
    messages: [
      assistantToolMessage(),
      {
        id: 'user-2',
        role: 'user',
        parts: [{ type: 'text', text: 'Continue while the tool runs.' }],
      },
    ],
  });

  await chat.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'call-1',
    output: { ok: true },
  });

  const earlierPart = chat.messages[0].parts[0];
  if (
    earlierPart.type !== 'dynamic-tool' ||
    earlierPart.state !== 'output-available' ||
    !isExpectedOutput(earlierPart.output)
  ) {
    const observed =
      earlierPart.type === 'dynamic-tool'
        ? `state=${earlierPart.state}; output=${JSON.stringify(earlierPart.output)}`
        : `partType=${earlierPart.type}`;

    throw new Error(
      `ISSUE_22355_REPRODUCED: addToolOutput did not update the earlier tool call (${observed})`,
    );
  }
}

main();
