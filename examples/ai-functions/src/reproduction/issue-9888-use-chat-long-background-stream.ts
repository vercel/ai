import {
  smoothStream,
  type ChatTransport,
  type TextStreamPart,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { createRequire } from 'node:module';

const ISSUE_SIGNAL =
  'ISSUE_9888_REPRODUCED: useChat did not publish the complete long/background stream';

type Scenario = {
  name: string;
  hideAfterFirstChunk: boolean;
};

type ReactLike = {
  createElement: (
    type: string | (() => unknown),
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ) => unknown;
  useEffect: (
    effect: () => void | (() => void),
    dependencies: readonly unknown[],
  ) => void;
};

type UseChatLike = (options: { transport: ChatTransport<UIMessage> }) => {
  messages: UIMessage[];
  sendMessage: (message: { text: string }) => Promise<void>;
  status: string;
};

async function runScenario({
  name,
  hideAfterFirstChunk,
}: Scenario): Promise<void> {
  const requireFromReactPackage = createRequire(
    new URL('../../../../packages/react/package.json', import.meta.url),
  );
  const { JSDOM } = requireFromReactPackage('jsdom') as {
    JSDOM: new (
      html: string,
      options: { url: string },
    ) => { window: Window & typeof globalThis };
  };
  const React = requireFromReactPackage('react') as ReactLike;
  const { createRoot } = requireFromReactPackage('react-dom/client') as {
    createRoot: (container: Element) => {
      render: (node: unknown) => void;
      unmount: () => void;
    };
  };
  const reactSdkUrl = new URL(
    '../../../../packages/react/dist/index.js',
    import.meta.url,
  );
  const { useChat } = (await import(reactSdkUrl.href)) as {
    useChat: UseChatLike;
  };

  const dom = new JSDOM('<main id="root"></main>', {
    url: 'http://localhost/',
  });
  const previousGlobals = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    navigator: globalThis.navigator,
    window: globalThis.window,
  };

  Object.defineProperties(globalThis, {
    document: { configurable: true, value: dom.window.document },
    HTMLElement: { configurable: true, value: dom.window.HTMLElement },
    navigator: { configurable: true, value: dom.window.navigator },
    window: { configurable: true, value: dom.window },
  });

  let visibilityState: DocumentVisibilityState = 'visible';
  Object.defineProperty(dom.window.document, 'visibilityState', {
    configurable: true,
    get: () => visibilityState,
  });

  const words = Array.from(
    { length: 16 },
    (_, index) => `minute-${index + 1} `,
  );
  const expectedText = words.join('');
  const observedDelayArguments: Array<number | null> = [];
  let logicalElapsedMinutes = 0;
  let hiddenTimerBlocked: (() => void) | undefined;
  const hiddenTimerWasBlocked = new Promise<void>(resolve => {
    hiddenTimerBlocked = resolve;
  });

  const delay = async (delayInMs: number | null) => {
    observedDelayArguments.push(delayInMs);
    logicalElapsedMinutes += 1;

    if (
      hideAfterFirstChunk &&
      logicalElapsedMinutes === 1 &&
      visibilityState === 'visible'
    ) {
      visibilityState = 'hidden';
      dom.window.document.dispatchEvent(
        new dom.window.Event('visibilitychange'),
      );
      return;
    }

    if (visibilityState === 'hidden' && delayInMs != null) {
      hiddenTimerBlocked?.();
      await new Promise(() => {});
    }
  };

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      const source = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            text: expectedText,
          });
          controller.enqueue({ type: 'text-end', id: 'text-1' });
          controller.close();
        },
      });

      return source
        .pipeThrough(
          smoothStream({
            delayInMs: 10,
            _internal: { delay },
          })({ tools: {} }),
        )
        .pipeThrough(
          new TransformStream<TextStreamPart<ToolSet>, UIMessageChunk>({
            transform(part, controller) {
              switch (part.type) {
                case 'text-start':
                  controller.enqueue({ type: 'text-start', id: part.id });
                  break;
                case 'text-delta':
                  controller.enqueue({
                    type: 'text-delta',
                    id: part.id,
                    delta: part.text,
                  });
                  break;
                case 'text-end':
                  controller.enqueue({ type: 'text-end', id: part.id });
                  break;
              }
            },
          }),
        );
    },
    async reconnectToStream() {
      return null;
    },
  };

  let sendError: unknown;

  function App() {
    const { messages, sendMessage, status } = useChat({ transport });
    const assistantText = messages
      .filter(message => message.role === 'assistant')
      .flatMap(message => message.parts)
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('');

    React.useEffect(() => {
      void sendMessage({ text: 'Start the controlled long stream' }).catch(
        error => {
          sendError = error;
        },
      );
    }, [sendMessage]);

    return React.createElement(
      'div',
      null,
      React.createElement('output', { id: 'status' }, status),
      React.createElement('output', { id: 'assistant-text' }, assistantText),
    );
  }

  const container = dom.window.document.querySelector('#root');
  if (container == null) {
    throw new Error('Test root was not created.');
  }

  const root = createRoot(container);
  root.render(React.createElement(App));

  const completed = new Promise<'completed'>(resolve => {
    const inspect = () => {
      const status = dom.window.document.querySelector('#status')?.textContent;
      const assistantText =
        dom.window.document.querySelector('#assistant-text')?.textContent;

      if (status === 'ready' && assistantText === expectedText) {
        resolve('completed');
        return;
      }

      dom.window.setTimeout(inspect, 1);
    };
    inspect();
  });

  const outcome = await Promise.race([
    completed,
    hiddenTimerWasBlocked.then(() => 'blocked' as const),
    new Promise<'timeout'>(resolve => {
      dom.window.setTimeout(() => resolve('timeout'), 5_000);
    }),
  ]);

  const status = dom.window.document.querySelector('#status')?.textContent;
  const assistantText =
    dom.window.document.querySelector('#assistant-text')?.textContent ?? '';

  root.unmount();
  dom.window.close();
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: previousGlobals.document },
    HTMLElement: { configurable: true, value: previousGlobals.HTMLElement },
    navigator: { configurable: true, value: previousGlobals.navigator },
    window: { configurable: true, value: previousGlobals.window },
  });

  if (
    outcome !== 'completed' ||
    sendError != null ||
    status !== 'ready' ||
    assistantText !== expectedText
  ) {
    console.error(`${name} failed:`, {
      assistantCharacters: assistantText.length,
      expectedCharacters: expectedText.length,
      logicalElapsedMinutes,
      observedDelayArguments,
      outcome,
      sendError,
      status,
    });
    throw new Error(ISSUE_SIGNAL);
  }

  console.log(`${name} passed:`, {
    assistantCharacters: assistantText.length,
    simulatedElapsedMinutes: logicalElapsedMinutes,
    observedDelayArguments,
    status,
    visibilityState,
  });
}

async function main() {
  await runScenario({
    name: '16 simulated-minute visible stream',
    hideAfterFirstChunk: false,
  });
  await runScenario({
    name: '16 simulated-minute stream hidden after the first chunk',
    hideAfterFirstChunk: true,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
