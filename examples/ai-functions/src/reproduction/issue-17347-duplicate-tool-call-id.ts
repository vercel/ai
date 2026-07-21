import {
  isToolOrDynamicToolUIPart,
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

async function main() {
  const chunks: UIMessageChunk[] = [
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
  ];

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
    throw new Error('No final UI message was produced.');
  }

  const toolParts = finalMessage.parts.filter(isToolOrDynamicToolUIPart);

  if (toolParts.length !== 2) {
    console.error(
      `ISSUE #17347 REPRODUCED: expected 2 tool parts across 2 steps, received ${toolParts.length}.`,
    );
    console.error(JSON.stringify(toolParts, null, 2));
    process.exitCode = 1;
    return;
  }

  const itemIds = toolParts.map(
    part => part.callProviderMetadata?.openai?.itemId,
  );

  if (
    toolParts.some(part => part.toolCallId !== 'call_0') ||
    itemIds[0] !== 'fc_step_1' ||
    itemIds[1] !== 'fc_step_2'
  ) {
    console.error(
      'Unexpected tool-part identity or provider metadata after aggregation.',
    );
    console.error(JSON.stringify(toolParts, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue not reproduced: both tool parts were preserved with unchanged provider protocol IDs.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
