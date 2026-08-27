import { validateTypes } from '@ai-sdk/provider-utils';
import {
  AbstractChat,
  readUIMessageStream,
  uiMessageChunkSchema,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const descriptor = {
  requestId: 'request-1',
  toolCallId: 'call-1',
  action: 'deleteAccount',
  summary: 'Delete account user-123',
  input: { userId: 'user-123' },
  permissions: ['accounts:delete'],
  risk: 'high',
  kind: 'approval-gated',
};

function createChunkStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function isSameJsonValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

class MemoryChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;

  constructor(public messages: UIMessage[]) {}

  pushMessage = (message: UIMessage) => {
    this.messages.push(message);
  };

  popMessage = () => {
    this.messages.pop();
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages[index] = structuredClone(message);
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class TestChat extends AbstractChat<UIMessage> {
  constructor(messages: UIMessage[]) {
    super({
      id: 'chat-1',
      state: new MemoryChatState(messages),
    });
  }
}

async function main() {
  const responseChat = new TestChat([
    {
      id: 'message-response',
      role: 'assistant',
      parts: [
        {
          type: 'tool-deleteAccount',
          toolCallId: 'call-response',
          state: 'approval-requested',
          input: { userId: 'user-123' },
          approval: {
            id: 'approval-response',
            descriptor,
          },
        } as any,
      ],
    },
  ]);

  await responseChat.addToolApprovalResponse({
    id: 'approval-response',
    approved: true,
  });

  const responsePart = responseChat.messages[0].parts[0] as any;
  if (!isSameJsonValue(responsePart.approval?.descriptor, descriptor)) {
    throw new Error(
      'Secondary check failed: addToolApprovalResponse dropped an existing approval descriptor.',
    );
  }

  const rawChunks: unknown[] = [
    { type: 'start', messageId: 'message-1' },
    { type: 'start-step' },
    {
      type: 'tool-input-available',
      toolCallId: 'call-1',
      toolName: 'deleteAccount',
      input: { userId: 'user-123' },
    },
    {
      type: 'tool-approval-request',
      approvalId: 'approval-1',
      toolCallId: 'call-1',
      approvalDescriptor: descriptor,
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ];

  const validatedChunks = await Promise.all(
    rawChunks.map(chunk =>
      validateTypes({ value: chunk, schema: uiMessageChunkSchema }),
    ),
  );

  const validatedApprovalChunk = validatedChunks.find(
    chunk => chunk.type === 'tool-approval-request',
  ) as UIMessageChunk & { approvalDescriptor?: unknown };

  if (!isSameJsonValue(validatedApprovalChunk.approvalDescriptor, descriptor)) {
    throw new Error(
      'Precondition failed: UI message chunk validation did not preserve approvalDescriptor.',
    );
  }

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: createChunkStream(validatedChunks),
  })) {
    finalMessage = message;
  }

  const toolPart = finalMessage?.parts.find(
    part => part.type === 'tool-deleteAccount',
  );
  const approval =
    toolPart != null && 'approval' in toolPart
      ? (toolPart.approval as Record<string, unknown> | undefined)
      : undefined;

  console.log(
    JSON.stringify(
      {
        responseTransitionPreservedDescriptor: true,
        validatedChunkApprovalDescriptor:
          validatedApprovalChunk.approvalDescriptor,
        clientApproval: approval,
        expectedClientApprovalDescriptor: descriptor,
      },
      null,
      2,
    ),
  );

  if (!isSameJsonValue(approval?.descriptor, descriptor)) {
    throw new Error(
      'Reproduced issue #19873: processUIMessageStream dropped approvalDescriptor instead of preserving it as part.approval.descriptor.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
