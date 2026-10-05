import assert from 'node:assert/strict';
import {
  AbstractChat,
  DefaultChatTransport,
  type ChatState,
  type ChatStatus,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';

class State implements ChatState<UIMessage> {
  status: ChatStatus = 'ready';
  messages: UIMessage[] = [];
  error: Error | undefined;

  pushMessage = (message: UIMessage) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: UIMessage) => {
    this.messages = [
      ...this.messages.slice(0, index),
      message,
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class Chat extends AbstractChat<UIMessage> {}

function formatChunk(chunk: UIMessageChunk): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function responseStream({
  chunks,
  error,
}: {
  chunks: UIMessageChunk[];
  error?: Error;
}): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(formatChunk(chunk));
        }

        if (error == null) {
          controller.close();
        } else {
          setTimeout(() => controller.error(error), 0);
        }
      },
    }),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    },
  );
}

async function runScenario(errorMessage: string) {
  const finishes: Array<{
    isDisconnect: boolean;
    isError: boolean;
  }> = [];

  const fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'GET') {
      return responseStream({
        chunks: [
          {
            type: 'text-delta',
            id: 'text-1',
            delta: ' response',
          },
          { type: 'text-end', id: 'text-1' },
          { type: 'finish-step' },
          { type: 'finish', finishReason: 'stop' },
        ],
      });
    }

    return responseStream({
      chunks: [
        { type: 'start', messageId: 'assistant-1' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        {
          type: 'text-delta',
          id: 'text-1',
          delta: 'partial',
        },
      ],
      error: new TypeError(errorMessage),
    });
  };

  const chat = new Chat({
    id: 'chat-1',
    state: new State(),
    transport: new DefaultChatTransport({
      api: 'http://example.test/api/chat',
      fetch,
    }),
    onFinish: ({ isDisconnect, isError }) => {
      finishes.push({ isDisconnect, isError });
    },
  });

  await chat.sendMessage({ text: 'hi' });
  await chat.resumeStream();

  const assistantMessages = chat.messages.filter(
    message => message.role === 'assistant',
  );
  const assistantText = assistantMessages
    .flatMap(message => message.parts)
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  return {
    finishes,
    assistantMessageCount: assistantMessages.length,
    assistantText,
    status: chat.status,
  };
}

async function main() {
  const control = await runScenario('network error');
  assert.deepEqual(control.finishes[0], {
    isDisconnect: true,
    isError: true,
  });
  assert.equal(control.assistantMessageCount, 1);
  assert.equal(control.assistantText, 'partial response');
  assert.equal(control.status, 'ready');

  const safari = await runScenario('Load failed');
  console.log(JSON.stringify({ control, safari }, null, 2));

  try {
    assert.deepEqual(safari.finishes[0], {
      isDisconnect: true,
      isError: true,
    });
    assert.equal(safari.assistantMessageCount, 1);
    assert.equal(safari.assistantText, 'partial response');
    assert.equal(safari.status, 'ready');
  } catch {
    console.error(
      'ISSUE #22083: Safari Load failed was not treated as a resumable disconnect',
    );
    process.exitCode = 1;
  }
}

main();
