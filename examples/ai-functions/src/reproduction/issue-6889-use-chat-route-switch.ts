import { createRequire } from 'node:module';
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';

const requireFromReactPackage = createRequire(
  new URL('../../../../packages/react/package.json', import.meta.url),
);
const React = requireFromReactPackage('react') as {
  act(callback: () => void | Promise<void>): Promise<void>;
  createElement(
    component: (props: { conversationId: string }) => null,
    props: { conversationId: string },
  ): unknown;
};
const { createRoot } = requireFromReactPackage('react-dom/client') as {
  createRoot(container: Element): {
    render(element: unknown): void;
    unmount(): void;
  };
};
const { JSDOM } = requireFromReactPackage('jsdom') as {
  JSDOM: new (html: string) => {
    window: Window & typeof globalThis;
  };
};

type ChatSnapshot = {
  id: string;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  messages: UIMessage[];
  sendMessage(message: { text: string }): Promise<void>;
};

function getText(message: UIMessage): string {
  return message.parts
    .filter(
      (
        part,
      ): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map(part => part.text)
    .join('');
}

async function main() {
  const reactPackageUrl = new URL(
    '../../../../packages/react/dist/index.js',
    import.meta.url,
  ).href;
  const { useChat } = (await import(reactPackageUrl)) as {
    useChat(options: {
      id: string;
      transport: ChatTransport<UIMessage>;
      generateId(): string;
      onFinish(options: { message: UIMessage }): void;
    }): ChatSnapshot;
  };

  const dom = new JSDOM('<div id="root"></div>');
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    navigator: { configurable: true, value: dom.window.navigator },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });

  let responseController:
    | ReadableStreamDefaultController<UIMessageChunk>
    | undefined;
  const responseStream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      responseController = controller;
    },
  });

  const requestedChatIds: string[] = [];
  const transport: ChatTransport<UIMessage> = {
    async sendMessages({ chatId }) {
      requestedChatIds.push(chatId);
      if (chatId !== 'conversation-a') {
        throw new Error(`Unexpected request for ${chatId}`);
      }
      return responseStream;
    },
    async reconnectToStream() {
      return null;
    },
  };

  let generatedId = 0;
  let latest: ChatSnapshot | undefined;
  const finishCallbacks: Array<{
    route: string;
    responseText: string;
  }> = [];

  function ChatRoute({ conversationId }: { conversationId: string }) {
    const chat = useChat({
      id: conversationId,
      transport,
      generateId: () => `id-${generatedId++}`,
      onFinish({ message }) {
        finishCallbacks.push({
          route: conversationId,
          responseText: getText(message),
        });
      },
    });

    latest = {
      id: chat.id,
      status: chat.status,
      messages: chat.messages,
      sendMessage: chat.sendMessage,
    };

    return null;
  }

  const container = document.getElementById('root');
  if (container == null) {
    throw new Error('Missing React root');
  }

  const root = createRoot(container);

  function getLatest(): ChatSnapshot {
    if (latest == null) {
      throw new Error('Chat route has not rendered');
    }
    return latest;
  }

  async function renderRoute(conversationId: string) {
    await React.act(async () => {
      root.render(React.createElement(ChatRoute, { conversationId }));
    });
  }

  async function waitFor(
    predicate: () => boolean,
    description: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (predicate()) {
        return;
      }
      await React.act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  await renderRoute('conversation-a');

  let sendPromise: Promise<void> | undefined;
  await React.act(async () => {
    sendPromise = getLatest().sendMessage({ text: 'hello from A' });
    await Promise.resolve();
  });
  await waitFor(
    () => latest?.status === 'submitted',
    'conversation A to be submitted',
  );

  await renderRoute('conversation-b');
  const conversationB = getLatest();
  if (
    conversationB.id !== 'conversation-b' ||
    conversationB.status !== 'ready' ||
    conversationB.messages.length !== 0
  ) {
    throw new Error(
      `Issue #6889 reproduced: active conversation B inherited A state (${conversationB.id}/${conversationB.status}/${conversationB.messages.length})`,
    );
  }

  await React.act(async () => {
    responseController!.enqueue({ type: 'text-start', id: 'text-0' });
    responseController!.enqueue({
      type: 'text-delta',
      id: 'text-0',
      delta: 'response for A',
    });
    responseController!.enqueue({ type: 'text-end', id: 'text-0' });
    responseController!.close();
    await sendPromise;
  });

  const conversationBAfterFinish = getLatest();
  if (
    conversationBAfterFinish.id !== 'conversation-b' ||
    conversationBAfterFinish.status !== 'ready' ||
    conversationBAfterFinish.messages.length !== 0
  ) {
    throw new Error(
      `Issue #6889 reproduced: A completion changed active conversation B (${conversationBAfterFinish.id}/${conversationBAfterFinish.status}/${conversationBAfterFinish.messages.length})`,
    );
  }

  await renderRoute('conversation-a');
  const returnedConversationA = getLatest();
  if (
    returnedConversationA.id !== 'conversation-a' ||
    returnedConversationA.status !== 'ready'
  ) {
    throw new Error(
      `Issue #6889 reproduced: conversation A status stayed ${returnedConversationA.status} after finishing on another route`,
    );
  }

  await React.act(async () => {
    root.unmount();
  });

  console.log(
    JSON.stringify(
      {
        requestedChatIds,
        activeRouteAfterBackgroundFinish: 'conversation-b',
        activeRouteStatusAfterBackgroundFinish: 'ready',
        returnedRoute: returnedConversationA.id,
        returnedRouteStatus: returnedConversationA.status,
        returnedRouteMessages: returnedConversationA.messages.length,
        finishCallbacks,
      },
      null,
      2,
    ),
  );
  console.log(
    'Issue #6889 could not be reproduced: returning to conversation A reports ready, not submitted.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
