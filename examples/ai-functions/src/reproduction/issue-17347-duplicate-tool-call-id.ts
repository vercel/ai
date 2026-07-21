import {
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from '../../../../packages/ai/src';

async function main() {
  const chunks = [
    { type: 'start', messageId: 'message-1' },
    { type: 'start-step' },
    {
      type: 'tool-input-available',
      toolCallId: 'call_0',
      toolName: 'recordStep',
      input: { step: 1 },
      providerMetadata: { openai: { itemId: 'fc_step_1' } },
    },
    {
      type: 'tool-output-available',
      toolCallId: 'call_0',
      output: { recorded: 1 },
    },
    { type: 'finish-step' },
    { type: 'start-step' },
    {
      type: 'tool-input-available',
      toolCallId: 'call_0',
      toolName: 'recordStep',
      input: { step: 2 },
      providerMetadata: { openai: { itemId: 'fc_step_2' } },
    },
    {
      type: 'tool-output-available',
      toolCallId: 'call_0',
      output: { recorded: 2 },
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ] satisfies UIMessageChunk[];

  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream })) {
    finalMessage = message;
  }

  if (finalMessage == null) {
    throw new Error('No final UIMessage was produced.');
  }

  const toolParts = finalMessage.parts.filter(
    part => part.type.startsWith('tool-') || part.type === 'dynamic-tool',
  );

  console.log(JSON.stringify(toolParts, null, 2));

  if (toolParts.length !== 2) {
    throw new Error(
      `ISSUE_17347_REPRODUCED: Expected 2 tool parts, received ${toolParts.length}; the repeated response-scoped toolCallId overwrote the earlier step.`,
    );
  }

  const expectedParts = [
    {
      toolCallId: 'call_0',
      input: { step: 1 },
      output: { recorded: 1 },
      itemId: 'fc_step_1',
    },
    {
      toolCallId: 'call_0',
      input: { step: 2 },
      output: { recorded: 2 },
      itemId: 'fc_step_2',
    },
  ];

  for (const [index, part] of toolParts.entries()) {
    const expected = expectedParts[index];
    if (
      part.toolCallId !== expected.toolCallId ||
      JSON.stringify(part.input) !== JSON.stringify(expected.input) ||
      !('output' in part) ||
      JSON.stringify(part.output) !== JSON.stringify(expected.output) ||
      part.callProviderMetadata?.openai?.itemId !== expected.itemId
    ) {
      throw new Error(
        `Tool part ${index + 1} did not preserve its step-local input, output, provider item ID, and original toolCallId.`,
      );
    }
  }

  console.log('PASS: both step-local tool parts were preserved.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
