import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import {
  Chat,
  useChat,
  type UseChatHelpers,
} from '../../../../packages/react/dist/index.js';

const requireFromReact = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);
const React = requireFromReact('react') as {
  act(callback: () => void | Promise<void>): Promise<void>;
  createElement(type: () => null): unknown;
};
const { createRoot } = requireFromReact('react-dom/client') as {
  createRoot(container: Element): {
    render(children: unknown): void;
    unmount(): void;
  };
};
const { JSDOM } = requireFromReact('jsdom') as {
  JSDOM: new (
    html: string,
    options: { url: string },
  ) => {
    window: Window & typeof globalThis & { close(): void };
  };
};

const expectedParts = [
  { type: 'step-start' },
  { type: 'text', text: 'Hello world', state: 'done' },
];

function stream(
  chunks: UIMessageChunk[],
  error?: Error,
): ReadableStream<UIMessageChunk> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
        return;
      }

      error == null ? controller.close() : controller.error(error);
    },
  });
}

function createReplayTransport(): ChatTransport<UIMessage> {
  return {
    resumeStreamIsReplay: true,
    async sendMessages() {
      return stream(
        [
          { type: 'start', messageId: 'assistant-1' },
          { type: 'start-step' },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        ],
        new TypeError('simulated network disconnect'),
      );
    },
    async reconnectToStream() {
      return stream([
        { type: 'start', messageId: 'assistant-1' },
        { type: 'start-step' },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hello' },
        { type: 'text-delta', id: 'text-1', delta: ' world' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish-step' },
        { type: 'finish' },
      ]);
    },
  };
}

function assistantParts(messages: UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'assistant') {
      return JSON.parse(JSON.stringify(messages[index].parts));
    }
  }

  return undefined;
}

async function runDirectChatControl() {
  const chat = new Chat({
    id: 'direct-chat',
    transport: createReplayTransport(),
    onError: () => {},
  });

  await chat.sendMessage({ text: 'hi' });
  await chat.resumeStream();

  assert.deepEqual(
    assistantParts(chat.messages),
    expectedParts,
    'Direct Chat control did not honor resumeStreamIsReplay',
  );
}

async function runUseChatScenario() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  let helpers: UseChatHelpers<UIMessage> | undefined;

  function Harness() {
    helpers = useChat({
      id: 'use-chat',
      transport: createReplayTransport(),
      onError: () => {},
    });
    return null;
  }

  const rootElement = document.getElementById('root');
  assert.ok(rootElement != null, 'Missing React root element');
  const root = createRoot(rootElement);

  try {
    await React.act(async () => {
      root.render(React.createElement(Harness));
    });
    assert.ok(helpers != null, 'useChat did not initialize');

    await React.act(async () => {
      await helpers!.sendMessage({ text: 'hi' });
    });
    await React.act(async () => {
      await helpers!.resumeStream();
    });

    return assistantParts(helpers.messages);
  } finally {
    await React.act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
}

async function main() {
  await runDirectChatControl();

  const actualParts = await runUseChatScenario();
  if (
    JSON.stringify(actualParts) ===
    JSON.stringify([
      { type: 'step-start' },
      { type: 'text', text: 'Hello', state: 'streaming' },
      { type: 'step-start' },
      { type: 'text', text: 'Hello world', state: 'done' },
    ])
  ) {
    console.error(
      'ISSUE #22358 REPRODUCED: useChat retained partial parts when reconnect returned a full replay',
    );
    console.error(JSON.stringify(actualParts, null, 2));
    process.exitCode = 1;
    return;
  }

  assert.deepEqual(
    actualParts,
    expectedParts,
    `useChat replay result differed unexpectedly: ${JSON.stringify(actualParts)}`,
  );
}

await main();
