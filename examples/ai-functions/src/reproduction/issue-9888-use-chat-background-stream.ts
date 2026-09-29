import { createRequire } from 'node:module';
import {
  type ChatTransport,
  smoothStream,
  streamText,
  type UIMessage,
} from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';

const require = createRequire(import.meta.url);

function getAssistantText(messages: UIMessage[]): string | undefined {
  const assistantMessage = messages.find(
    message => message.role === 'assistant',
  );

  return assistantMessage?.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              'useChat stopped before the hidden long stream completed',
            ),
          ),
        timeoutMs,
      );
    }),
  ]);
}

async function main() {
  const {
    JSDOM,
  } = require('../../../../packages/react/node_modules/jsdom/lib/api.js');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
  });

  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    Node: dom.window.Node,
    window: dom.window,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'hidden',
  });

  const React = require('../../../../packages/react/node_modules/react/index.js');
  const {
    act,
    cleanup,
    renderHook,
  } = require('../../../../packages/react/node_modules/@testing-library/react/dist/index.js');
  const { useChat } = require('../../../../packages/react/dist/index.js');

  const wordCount = 901;
  const expectedText =
    Array.from({ length: wordCount }, (_, index) => `word-${index}`).join(' ') +
    ' ';
  const delayArguments: Array<number | null> = [];

  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          id: 'response-1',
          modelId: 'mock-model',
          timestamp: new Date(0),
        },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: expectedText },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: wordCount,
              text: wordCount,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });

  const transport: ChatTransport<UIMessage> = {
    async sendMessages() {
      return streamText({
        model,
        prompt: 'Generate a long response.',
        experimental_transform: smoothStream({
          // 901 chunks at this cadence represent over 15 minutes of pacing.
          delayInMs: 1_000,
          _internal: {
            delay: async delayInMs => {
              delayArguments.push(delayInMs);

              // Model browser background throttling: a scheduled timer does
              // not make progress, while a skipped delay resolves immediately.
              if (delayInMs !== null) {
                await new Promise(() => {});
              }
            },
          },
        }),
      }).toUIMessageStream();
    },
    async reconnectToStream() {
      return null;
    },
  };

  const observedAssistantTexts: string[] = [];
  const rendered = renderHook(() => {
    const chat = useChat({ transport });

    React.useEffect(() => {
      const text = getAssistantText(chat.messages);
      if (text != null && observedAssistantTexts.at(-1) !== text) {
        observedAssistantTexts.push(text);
      }
    }, [chat.messages]);

    return chat;
  });

  try {
    await act(async () => {
      await withTimeout(
        rendered.result.current.sendMessage({ text: 'Start.' }),
        2_000,
      );
    });

    const finalText = getAssistantText(rendered.result.current.messages);

    if (rendered.result.current.status !== 'ready') {
      throw new Error(
        `useChat did not return to ready; status=${rendered.result.current.status}`,
      );
    }

    if (finalText !== expectedText) {
      throw new Error(
        `useChat did not render the complete response; received ${finalText?.length ?? 0} of ${expectedText.length} characters`,
      );
    }

    if (
      delayArguments.length !== wordCount ||
      delayArguments.some(value => value !== null)
    ) {
      throw new Error(
        `smoothStream scheduled a throttled background delay: ${JSON.stringify(delayArguments.slice(0, 10))}`,
      );
    }

    console.log(
      `PASS: useChat rendered all ${wordCount} words and reached ready while the document was hidden; all smoothing delays were skipped.`,
    );
  } finally {
    rendered.unmount();
    cleanup();
    dom.window.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
