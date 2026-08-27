import { isDeepStrictEqual } from 'node:util';
import { parseJsonEventStream, type ParseResult } from '@ai-sdk/provider-utils';
import {
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

const approvalDescriptor = {
  requestId: 'request-1',
  toolCallId: 'call-1',
  action: 'deleteAccount',
  summary: 'Delete account user-123',
  input: { userId: 'user-123' },
  permissions: ['account:delete'],
  risk: 'high',
  kind: 'approval-gated',
};

function createValidatedChunkStream(
  chunks: Array<Record<string, unknown>>,
): ReadableStream<UIMessageChunk> {
  const encoder = new TextEncoder();
  const body = chunks
    .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
    .join('');

  return parseJsonEventStream({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream<ParseResult<UIMessageChunk>, UIMessageChunk>({
      transform(result, controller) {
        if (!result.success) {
          throw result.error;
        }

        controller.enqueue(result.value);
      },
    }),
  );
}

async function getFinalMessage(
  chunks: Array<Record<string, unknown>>,
): Promise<UIMessage> {
  let finalMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({
    stream: createValidatedChunkStream(chunks),
    terminateOnError: true,
  })) {
    finalMessage = message;
  }

  if (finalMessage == null) {
    throw new Error('The UI message stream produced no message.');
  }

  return finalMessage;
}

function getApproval(message: UIMessage): Record<string, unknown> {
  const toolPart = message.parts.find(
    part => part.type === 'tool-deleteAccount',
  );

  if (
    toolPart == null ||
    !('approval' in toolPart) ||
    toolPart.approval == null
  ) {
    throw new Error(
      'The UI message did not contain the expected tool approval.',
    );
  }

  return toolPart.approval as Record<string, unknown>;
}

async function main() {
  const inputChunk = {
    type: 'tool-input-available',
    toolCallId: 'call-1',
    toolName: 'deleteAccount',
    input: { userId: 'user-123' },
  };
  const requestChunk = {
    type: 'tool-approval-request',
    approvalId: 'approval-1',
    toolCallId: 'call-1',
    approvalDescriptor,
  };

  const requestApproval = getApproval(
    await getFinalMessage([inputChunk, requestChunk]),
  );
  const responseApproval = getApproval(
    await getFinalMessage([
      inputChunk,
      requestChunk,
      {
        type: 'tool-approval-response',
        approvalId: 'approval-1',
        approved: true,
      },
    ]),
  );

  const observed = {
    requestApproval,
    responseApproval,
  };
  console.log(JSON.stringify(observed, null, 2));

  if (
    !isDeepStrictEqual(requestApproval.descriptor, approvalDescriptor) ||
    !isDeepStrictEqual(responseApproval.descriptor, approvalDescriptor)
  ) {
    throw new Error(
      'ISSUE_19873_APPROVAL_DESCRIPTOR_DROPPED: processUIMessageStream did not preserve approvalDescriptor as approval.descriptor through request and response states.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
