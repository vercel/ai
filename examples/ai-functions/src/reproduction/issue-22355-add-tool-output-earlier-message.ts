import type { UIMessage } from 'ai';
import { Chat } from '../../../../packages/react/dist/index.mjs';

const toolOutput = { ok: true };

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
  const control = new Chat({
    id: 'control',
    messages: [assistantToolMessage()],
  });

  await control.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'call-1',
    output: toolOutput,
  });

  const controlPart = control.messages[0].parts[0];
  if (
    controlPart.type !== 'dynamic-tool' ||
    controlPart.state !== 'output-available' ||
    controlPart.output !== toolOutput
  ) {
    throw new Error(
      'CONTROL_FAILED: addToolOutput did not update the latest message',
    );
  }

  const laterUserMessage: UIMessage = {
    id: 'user-2',
    role: 'user',
    parts: [{ type: 'text', text: 'Continue while the tool runs.' }],
  };
  const chat = new Chat({
    id: 'repro',
    messages: [assistantToolMessage(), laterUserMessage],
  });

  await chat.addToolOutput({
    tool: 'test-tool',
    toolCallId: 'call-1',
    output: toolOutput,
  });

  const earlierPart = chat.messages[0].parts[0];
  if (
    earlierPart.type !== 'dynamic-tool' ||
    earlierPart.state !== 'output-available' ||
    earlierPart.output !== toolOutput
  ) {
    throw new Error(
      'ISSUE_22355_REPRODUCED: addToolOutput silently dropped the result for a matching tool call in an earlier message',
    );
  }

  if (
    chat.messages.length !== 2 ||
    chat.messages[1].id !== laterUserMessage.id ||
    chat.messages[1].role !== laterUserMessage.role ||
    chat.messages[1].parts[0].type !== 'text' ||
    chat.messages[1].parts[0].text !== 'Continue while the tool runs.'
  ) {
    throw new Error(
      'MESSAGE_PRESERVATION_FAILED: updating the earlier tool call changed the later message',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
