import { Chat } from '../../../../packages/react/dist/index.js';
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

function createStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function getApplyPatchParts(messages: UIMessage[]) {
  let assistantMessage: UIMessage | undefined;

  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') {
      assistantMessage = messages[index];
      break;
    }
  }

  return (
    assistantMessage?.parts.flatMap(part =>
      part.type === 'tool-apply_patch' &&
      'toolCallId' in part &&
      typeof part.toolCallId === 'string' &&
      'state' in part &&
      typeof part.state === 'string'
        ? [{ toolCallId: part.toolCallId, state: part.state }]
        : [],
    ) ?? []
  );
}

async function runScenario({
  callCount,
  errorEvery,
}: {
  callCount: number;
  errorEvery?: number;
}) {
  let requestCount = 0;
  let toolHandlerCount = 0;
  const errors: Error[] = [];
  const toolResultPromises: Promise<void>[] = [];

  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ messages }) {
      requestCount++;

      if (requestCount === 1) {
        const chunks: UIMessageChunk[] = [
          { type: 'start' },
          { type: 'start-step' },
        ];

        for (let index = 0; index < callCount; index++) {
          chunks.push({
            type: 'tool-input-available',
            toolCallId: `apply-patch-${index}`,
            toolName: 'apply_patch',
            input: {
              patch:
                index % 2 === 0
                  ? `*** Add File: file-${index}.txt`
                  : `*** Delete File: file-${index}.txt`,
            },
          });
        }

        chunks.push(
          { type: 'finish-step' },
          { type: 'finish', finishReason: 'tool-calls' },
        );

        return createStream(chunks);
      }

      const toolParts = getApplyPatchParts(messages);
      const missingPart = toolParts.find(
        part =>
          !(part.state === 'output-available' || part.state === 'output-error'),
      );

      if (toolParts.length !== callCount || missingPart != null) {
        const missingToolCallId =
          missingPart?.toolCallId ?? `expected-${callCount}-tool-results`;

        return createStream([
          { type: 'start' },
          {
            type: 'error',
            errorText: `No tool output found for apply patch call ${missingToolCallId}`,
          },
        ]);
      }

      return createStream([
        { type: 'start' },
        { type: 'start-step' },
        { type: 'text-start', id: 'done' },
        {
          type: 'text-delta',
          id: 'done',
          delta: 'All patch results received.',
        },
        { type: 'text-end', id: 'done' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    },
    async reconnectToStream() {
      return null;
    },
  };

  let chat: Chat<UIMessage>;
  chat = new Chat({
    id: `issue-11267-${callCount}`,
    generateId: (() => {
      let id = 0;
      return () => `message-${id++}`;
    })(),
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onError(error) {
      errors.push(error);
    },
    async onToolCall({ toolCall }) {
      toolHandlerCount++;

      // Match the reported quick, sequential client-side execution.
      await new Promise(resolve => setTimeout(resolve, 20));

      if (errorEvery != null && toolHandlerCount % errorEvery === 0) {
        toolResultPromises.push(
          Promise.resolve(
            chat.addToolResult({
              state: 'output-error',
              tool: 'apply_patch',
              toolCallId: toolCall.toolCallId,
              errorText: 'Patch failed as expected for this test call.',
            }),
          ),
        );
      } else {
        toolResultPromises.push(
          Promise.resolve(
            chat.addToolResult({
              tool: 'apply_patch',
              toolCallId: toolCall.toolCallId,
              output: { success: true },
            }),
          ),
        );
      }
    },
  });

  await chat.sendMessage({ text: `Run ${callCount} apply_patch calls.` });
  await Promise.all(toolResultPromises);

  const toolParts = getApplyPatchParts(chat.messages);
  const completedCount = toolParts.filter(
    part => part.state === 'output-available' || part.state === 'output-error',
  ).length;

  if (errors.length > 0) {
    throw errors[0];
  }

  if (toolHandlerCount !== callCount || completedCount !== callCount) {
    throw new Error(
      `Only ${completedCount}/${callCount} tool outputs completed after ${toolHandlerCount} handlers.`,
    );
  }

  if (requestCount !== 2) {
    throw new Error(
      `Expected one automatic follow-up request, received ${requestCount - 1}.`,
    );
  }

  if (chat.status !== 'ready') {
    throw new Error(`Expected ready status, received ${chat.status}.`);
  }
}

async function main() {
  const scenarios = [
    ...Array.from({ length: 10 }, () => ({ callCount: 2 })),
    ...Array.from({ length: 5 }, () => ({ callCount: 5 })),
    { callCount: 31 },
    { callCount: 5, errorEvery: 2 },
  ];

  for (const scenario of scenarios) {
    await runScenario(scenario);
  }

  console.log(
    'PASS: all apply_patch outputs were present before automatic submission.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
