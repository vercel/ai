import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  AbstractChat,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  readUIMessageStream,
  streamText,
  tool,
  type ChatInit,
  type ChatState,
  type ChatStatus,
  type ChatTransport,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

type ToolKind = 'static' | 'dynamic';

const issueSignal = 'ISSUE_21083_PRELIMINARY_OUTPUT_TRIGGERED_AUTOSEND';

function progressPart(kind: ToolKind): UIMessage['parts'][number] {
  return kind === 'static'
    ? {
        type: 'tool-buildOutline',
        toolCallId: 'progress-call',
        state: 'output-available',
        input: {},
        output: { progress: 50 },
        preliminary: true,
      }
    : {
        type: 'dynamic-tool',
        toolName: 'buildOutline',
        toolCallId: 'progress-call',
        state: 'output-available',
        input: {},
        output: { progress: 50 },
        preliminary: true,
      };
}

function inputPart(kind: ToolKind): UIMessage['parts'][number] {
  return kind === 'static'
    ? {
        type: 'tool-finishOutline',
        toolCallId: 'client-call',
        state: 'input-available',
        input: {},
      }
    : {
        type: 'dynamic-tool',
        toolName: 'finishOutline',
        toolCallId: 'client-call',
        state: 'input-available',
        input: {},
      };
}

function approvalPart(
  kind: ToolKind,
  state: 'approval-requested' | 'approval-responded',
): UIMessage['parts'][number] {
  if (state === 'approval-requested') {
    return kind === 'static'
      ? {
          type: 'tool-confirmOutline',
          toolCallId: 'approval-tool-call',
          state,
          input: {},
          approval: { id: 'approval-call' },
        }
      : {
          type: 'dynamic-tool',
          toolName: 'confirmOutline',
          toolCallId: 'approval-tool-call',
          state,
          input: {},
          approval: { id: 'approval-call' },
        };
  }

  return kind === 'static'
    ? {
        type: 'tool-confirmOutline',
        toolCallId: 'approval-tool-call',
        state,
        input: {},
        approval: { id: 'approval-call', approved: true },
      }
    : {
        type: 'dynamic-tool',
        toolName: 'confirmOutline',
        toolCallId: 'approval-tool-call',
        state,
        input: {},
        approval: { id: 'approval-call', approved: true },
      };
}

function assistantMessage(parts: UIMessage['parts']): UIMessage {
  return {
    id: 'synthetic-message',
    role: 'assistant',
    parts: [{ type: 'step-start' }, ...parts],
  };
}

class RehydratedChatState implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  error: Error | undefined;

  constructor(public messages: UIMessage[]) {}

  pushMessage = (message: UIMessage) => {
    this.messages = [...this.messages, message];
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = this.messages.map((current, currentIndex) =>
      currentIndex === index ? message : current,
    );
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class RecordingTransport implements ChatTransport<UIMessage> {
  sendCount = 0;

  async sendMessages({
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]) {
    this.sendCount++;

    return new ReadableStream({
      start(controller) {
        if (abortSignal?.aborted) {
          controller.close();
        } else {
          abortSignal?.addEventListener('abort', () => controller.close(), {
            once: true,
          });
        }
      },
    });
  }

  async reconnectToStream() {
    return null;
  }
}

class RehydratedChat extends AbstractChat<UIMessage> {
  constructor({
    messages,
    ...init
  }: ChatInit<UIMessage> & { messages: UIMessage[] }) {
    super({
      ...init,
      state: new RehydratedChatState(messages),
    });
  }
}

async function waitForAutomaticSend(transport: RecordingTransport) {
  const deadline = Date.now() + 100;

  while (transport.sendCount === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

async function countToolOutputAutomaticSends(kind: ToolKind) {
  const transport = new RecordingTransport();
  const chat = new RehydratedChat({
    messages: [assistantMessage([progressPart(kind), inputPart(kind)])],
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  await chat.addToolOutput({
    tool: kind === 'static' ? 'finishOutline' : 'dynamic-tool',
    toolCallId: 'client-call',
    output: { complete: true },
  });
  await waitForAutomaticSend(transport);
  await chat.stop();

  return transport.sendCount;
}

async function countApprovalAutomaticSends(kind: ToolKind) {
  const transport = new RecordingTransport();
  const chat = new RehydratedChat({
    messages: [
      assistantMessage([
        progressPart(kind),
        approvalPart(kind, 'approval-requested'),
      ]),
    ],
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  await chat.addToolApprovalResponse({
    id: 'approval-call',
    approved: true,
  });
  await waitForAutomaticSend(transport);
  await chat.stop();

  return transport.sendCount;
}

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

function modelStream() {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({
        type: 'tool-call',
        toolCallId: 'generated-progress-call',
        toolName: 'buildOutline',
        input: '{}',
      });
      controller.enqueue({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      });
      controller.close();
    },
  });
}

async function captureInterruptedGeneratorMessage() {
  const abortController = new AbortController();
  const model = new MockLanguageModelV4({
    doStream: async () => ({ stream: modelStream() }),
  });
  const result = streamText({
    model,
    prompt: 'Build an outline.',
    abortSignal: abortController.signal,
    tools: {
      buildOutline: tool({
        inputSchema: z.object({}),
        async *execute(_input, { abortSignal }) {
          yield { progress: 50 };

          const signal = abortSignal ?? abortController.signal;
          await new Promise<never>((_resolve, reject) => {
            const rejectForAbort = () =>
              reject(signal.reason ?? new Error('aborted'));

            if (signal.aborted) {
              rejectForAbort();
            } else {
              signal.addEventListener('abort', rejectForAbort, {
                once: true,
              });
            }
          });
        },
      }),
    },
  });

  let interruptedMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    const hasPreliminaryOutput = message.parts.some(
      part =>
        isToolUIPart(part) &&
        part.state === 'output-available' &&
        part.preliminary === true,
    );

    if (hasPreliminaryOutput) {
      interruptedMessage = structuredClone(message);
      abortController.abort();
    }
  }

  return interruptedMessage;
}

async function main() {
  const failures: string[] = [];

  for (const kind of ['static', 'dynamic'] as const) {
    const progress = assistantMessage([progressPart(kind)]);
    if (lastAssistantMessageIsCompleteWithToolCalls({ messages: [progress] })) {
      failures.push(`${kind} preliminary output was treated as tool-complete`);
    }

    const withApproval = assistantMessage([
      progressPart(kind),
      approvalPart(kind, 'approval-responded'),
    ]);
    if (
      lastAssistantMessageIsCompleteWithApprovalResponses({
        messages: [withApproval],
      })
    ) {
      failures.push(
        `${kind} preliminary output was treated as complete after approval`,
      );
    }

    const toolSendCount = await countToolOutputAutomaticSends(kind);
    if (toolSendCount !== 0) {
      failures.push(
        `${kind} rehydrated chat sent ${toolSendCount} request after another tool completed`,
      );
    }

    const approvalSendCount = await countApprovalAutomaticSends(kind);
    if (approvalSendCount !== 0) {
      failures.push(
        `${kind} rehydrated chat sent ${approvalSendCount} request after approval`,
      );
    }
  }

  const interruptedMessage = await captureInterruptedGeneratorMessage();
  if (!interruptedMessage) {
    throw new Error(
      'Reproduction setup failed to capture the interrupted preliminary tool output.',
    );
  }
  if (
    lastAssistantMessageIsCompleteWithToolCalls({
      messages: [interruptedMessage],
    })
  ) {
    failures.push(
      'interrupted async-generator output was treated as tool-complete',
    );
  }

  const finalOutput = assistantMessage([
    {
      type: 'tool-buildOutline',
      toolCallId: 'progress-call',
      state: 'output-available',
      input: {},
      output: { progress: 100 },
      preliminary: false,
    },
  ]);
  const unfinishedInput = assistantMessage([inputPart('static')]);
  if (
    !lastAssistantMessageIsCompleteWithToolCalls({
      messages: [finalOutput],
    }) ||
    lastAssistantMessageIsCompleteWithToolCalls({
      messages: [unfinishedInput],
    })
  ) {
    throw new Error('Reproduction controls did not match the helper contract.');
  }

  if (failures.length > 0) {
    throw new Error(`${issueSignal}: ${failures.join('; ')}`);
  }

  console.log('Preliminary tool outputs did not trigger automatic submission.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
