import { renderComponent } from '@ember/renderer';
import { createUIMessageStreamResponse, type UIMessageChunk } from 'ai';
import { onTestFinished } from 'vitest';
import { page, type Locator } from 'vitest/browser';

import type { ComponentLike } from '@glint/template';

let renderCount = 0;

/**
 * Renders a component into a new element on the page,
 * and removes it when the test finishes.
 *
 * `unmount` destroys the component in the middle of a test,
 * the way a route change would.
 */
export function render(
  component: ComponentLike<unknown>,
  args?: Record<string, unknown>,
): { screen: Locator; unmount: () => void } {
  const element = document.createElement('div');
  element.dataset.testid = `render-${renderCount++}`;
  document.body.append(element);

  const result = renderComponent(component, { into: element, args });

  let mounted = true;
  const unmount = () => {
    if (mounted) {
      mounted = false;
      result.destroy();
    }
  };

  onTestFinished(() => {
    unmount();
    element.remove();
  });

  return { screen: page.elementLocator(element), unmount };
}

export type RecordedRequest = {
  url: string;
  body: unknown;
  headers: Headers;
  credentials: RequestCredentials | undefined;
  signal: AbortSignal | undefined;
};

/**
 * A `fetch` for the tests.
 *
 * Only the network is replaced.
 * The `Chat`, `Completion`, and `StructuredObject` code under test
 * reads the response with the same stream parsers as in an app.
 */
export function createFetch(respond: (request: RecordedRequest) => Response) {
  const requests: RecordedRequest[] = [];

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: RecordedRequest = {
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      signal: init?.signal ?? undefined,
    };

    requests.push(request);

    return abortable(respond(request), request.signal);
  };

  return { fetch, requests };
}

/**
 * A real `fetch` errors the response body when its signal aborts.
 *
 * The test responses do the same,
 * so code that waits on the body sees the abort as it would in an app.
 */
function abortable(response: Response, signal: AbortSignal | undefined) {
  const source = response.body;

  if (signal === undefined || source === null) {
    return response;
  }

  const reader = source.getReader();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => {
          controller.error(signal.reason);
          void reader.cancel(signal.reason);
        },
        { once: true },
      );
    },
    async pull(controller) {
      const { done, value } = await reader.read();

      if (signal.aborted) {
        return;
      }

      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * A response body that the test writes to chunk by chunk,
 * so it can check the page between chunks.
 */
export function createControlledStream<CHUNK>() {
  let controller!: ReadableStreamDefaultController<CHUNK>;

  const stream = new ReadableStream<CHUNK>({
    start(c) {
      controller = c;
    },
  });

  return {
    stream,
    write(chunk: CHUNK) {
      controller.enqueue(chunk);
    },
    close() {
      controller.close();
    },
  };
}

/**
 * A UI message stream response, as `toUIMessageStreamResponse` sends it.
 */
export function uiMessageStreamResponse(
  stream: ReadableStream<UIMessageChunk>,
): Response {
  return createUIMessageStreamResponse({ stream });
}

/**
 * A plain text stream response, as `toTextStreamResponse` sends it.
 */
export function textStreamResponse(stream: ReadableStream<string>): Response {
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * A text stream response that is already complete.
 */
export function textResponse(chunks: string[]): Response {
  const { stream, write, close } = createControlledStream<string>();

  for (const chunk of chunks) {
    write(chunk);
  }

  close();

  return textStreamResponse(stream);
}
