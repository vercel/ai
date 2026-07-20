import { readUIMessageStream, type UIMessageChunk } from 'ai';

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

  let finalMessage;
  for await (const message of readUIMessageStream({ stream })) {
    finalMessage = message;
  }

  if (finalMessage == null) {
    throw new Error('Issue #17347 reproduction failed to produce a UIMessage');
  }

  const toolParts = finalMessage.parts.filter(
    part => part.type.startsWith('tool-') || part.type === 'dynamic-tool',
  );

  console.log(JSON.stringify(toolParts, null, 2));

  if (toolParts.length !== 2) {
    throw new Error(
      `Issue #17347 reproduced: expected 2 tool parts across steps, received ${toolParts.length}`,
    );
  }

  const inputs = toolParts.map(part => ('input' in part ? part.input : null));
  const outputs = toolParts.map(part =>
    'output' in part ? part.output : null,
  );
  const itemIds = toolParts.map(part =>
    'callProviderMetadata' in part
      ? part.callProviderMetadata?.openai?.itemId
      : undefined,
  );
  const toolCallIds = toolParts.map(part =>
    'toolCallId' in part ? part.toolCallId : undefined,
  );

  if (
    JSON.stringify(inputs) !== JSON.stringify([{ step: 1 }, { step: 2 }]) ||
    JSON.stringify(outputs) !==
      JSON.stringify([{ recorded: 1 }, { recorded: 2 }]) ||
    JSON.stringify(itemIds) !== JSON.stringify(['fc_step_1', 'fc_step_2']) ||
    JSON.stringify(toolCallIds) !== JSON.stringify(['call_0', 'call_0'])
  ) {
    throw new Error(
      'Issue #17347 reproduced: tool parts did not preserve both step payloads and provider protocol IDs',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
