import { JSDOM } from 'jsdom';
import {
  type ChatTransport,
  type UIMessage,
  type UIMessageChunk,
  smoothStream,
} from 'ai';

const WORD_COUNT = 4_000;
const TIMEOUT_MS = 10_000;
const expectedText = Array.from(
  { length: WORD_COUNT },
  (_, index) => `word${index.toString().padStart(4, '0')} `,
).join('');

let nonNullDelayCalls = 0;
let emittedTextChunks = 0;

function createHiddenLongStream(): ReadableStream<UIMessageChunk> {
  const source = new ReadableStream<any>({
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

  const smoothed = source.pipeThrough(
    smoothStream({
      chunking: 'word',
      delayInMs: 10,
      _internal: {
        delay: delayInMs => {
          if (delayInMs != null) {
            nonNullDelayCalls += 1;

            // Model a browser background timer that has been indefinitely
            // deferred. The fixed implementation passes null while hidden.
            return new Promise(() => {});
          }

          return Promise.resolve();
        },
      },
    })({ tools: {} }),
  );
  const reader = smoothed.getReader();
  let finishSent = false;

  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      const { done, value } = await reader.read();

      if (done) {
        if (!finishSent) {
          finishSent = true;
          controller.enqueue({ type: 'finish', finishReason: 'stop' });
        }
        controller.close();
        return;
      }

      if (value.type === 'text-delta') {
        emittedTextChunks += 1;
        controller.enqueue({
          type: 'text-delta',
          id: value.id,
          delta: value.text,
        });
        return;
      }

      controller.enqueue(value as UIMessageChunk);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

async function main() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://localhost',
  });

  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    Node: dom.window.Node,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(dom.window.document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });
  Object.defineProperty(dom.window.document, 'hidden', {
    configurable: true,
    value: true,
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { useChat } = await import('@ai-sdk/react');

  let sendPromise: Promise<void> | undefined;

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      return createHiddenLongStream();
    },
    async reconnectToStream() {
      return null;
    },
  };

  function App() {
    const { error, messages, sendMessage, status } = useChat({
      // A modest publication throttle keeps the reproduction focused on
      // stream completion instead of thousands of incidental React renders.
      experimental_throttle: 25,
      transport,
    });

    React.useEffect(() => {
      sendPromise = sendMessage({ text: 'start the long response' });
    }, [sendMessage]);

    const assistantText =
      messages
        .findLast(message => message.role === 'assistant')
        ?.parts.map(part => (part.type === 'text' ? part.text : ''))
        .join('') ?? '';

    return React.createElement('output', {
      'data-error': error?.message ?? '',
      'data-status': status,
      'data-text': assistantText,
    });
  }

  const container = dom.window.document.getElementById('root');
  if (container == null) {
    throw new Error('reproduction root was not created');
  }

  const root = createRoot(container);

  try {
    await act(async () => {
      root.render(React.createElement(App));
    });

    if (sendPromise == null) {
      throw new Error('useChat did not start the request');
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const outcome = await act(async () =>
      Promise.race([
        sendPromise!.then(() => 'completed' as const),
        new Promise<'timed-out'>(resolve => {
          timeout = setTimeout(() => resolve('timed-out'), TIMEOUT_MS);
        }),
      ]),
    );
    if (timeout != null) {
      clearTimeout(timeout);
    }

    const output = container.querySelector('output');
    const status = output?.getAttribute('data-status');
    const text = output?.getAttribute('data-text');
    const error = output?.getAttribute('data-error');

    if (
      outcome !== 'completed' ||
      status !== 'ready' ||
      text !== expectedText ||
      error
    ) {
      throw new Error(
        `ISSUE_9888_REPRODUCED: useChat stopped before the hidden long stream completed (outcome=${outcome}, status=${status}, rendered=${text?.length ?? 0}/${expectedText.length}, error=${error || 'none'})`,
      );
    }

    if (nonNullDelayCalls !== 0 || emittedTextChunks !== WORD_COUNT) {
      throw new Error(
        `reproduction invariant failed (nonNullDelayCalls=${nonNullDelayCalls}, emittedTextChunks=${emittedTextChunks}/${WORD_COUNT})`,
      );
    }

    console.log(
      `Issue #9888 not reproduced: useChat rendered all ${emittedTextChunks} chunks (${text.length} characters) and reached ready while document.visibilityState=hidden.`,
    );
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
