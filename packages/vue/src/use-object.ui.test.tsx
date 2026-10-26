import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { effectScope, watch } from 'vue';
import { z } from 'zod/v4';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestComponent } from './setup-test-component';
import TestUseObjectComponent from './TestUseObjectComponent.vue';
import TestUseObjectCustomTransportComponent from './TestUseObjectCustomTransportComponent.vue';
import { useObject } from './use-object';

const server = createTestServer({
  '/api/use-object': {},
});

describe('text stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  describe('basic component', () => {
    setupTestComponent(TestUseObjectComponent);

    describe("when the API returns 'Hello, world!'", () => {
      beforeEach(async () => {
        server.urls['/api/use-object'].response = {
          type: 'stream-chunks',
          chunks: ['{ ', '"content": "Hello, ', 'world', '!"'],
        };
        await userEvent.click(screen.getByTestId('submit-button'));
      });

      it('should render stream', async () => {
        await screen.findByTestId('object');
        expect(screen.getByTestId('object')).toHaveTextContent(
          JSON.stringify({ content: 'Hello, world!' }),
        );
      });

      it("should send 'test' to the API", async () => {
        expect(await server.calls[0].requestBodyJson).toBe('test-input');
      });

      it('should not have an error', async () => {
        await screen.findByTestId('error');
        expect(screen.getByTestId('error')).toBeEmptyDOMElement();
        expect(screen.getByTestId('on-error-result')).toBeEmptyDOMElement();
      });
    });

    describe('isLoading', () => {
      it('should be true while loading', async () => {
        const controller = new TestResponseController();
        server.urls['/api/use-object'].response = {
          type: 'controlled-stream',
          controller,
        };

        controller.write('{"content": ');
        await userEvent.click(screen.getByTestId('submit-button'));

        // wait for element "loading" to have text content "true":
        await waitFor(() => {
          expect(screen.getByTestId('loading')).toHaveTextContent('true');
        });

        controller.write('"Hello, world!"}');
        controller.close();

        // wait for element "loading" to have text content "false":
        await waitFor(() => {
          expect(screen.getByTestId('loading')).toHaveTextContent('false');
        });
      });
    });

    it('should abort the stream and not consume any more data', async () => {
      const controller = new TestResponseController();
      server.urls['/api/use-object'].response = {
        type: 'controlled-stream',
        controller,
      };

      controller.write('{"content": "h');
      await userEvent.click(screen.getByTestId('submit-button'));

      // wait for element "loading" and "object" to have text content:
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('true');
      });
      await waitFor(() => {
        expect(screen.getByTestId('object')).toHaveTextContent(
          '{"content":"h"}',
        );
      });

      // click stop button:
      await userEvent.click(screen.getByTestId('stop-button'));

      // wait for element "loading" to have text content "false":
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      // this should not be consumed any more:
      await expect(controller.write('ello, world!"}')).rejects.toThrow();
      await expect(controller.close()).rejects.toThrow();

      // should only show start of object:
      await waitFor(() => {
        expect(screen.getByTestId('object')).toHaveTextContent(
          '{"content":"h"}',
        );
      });
    });

    it('should stop and clear the object state after a call to submit then clear', async () => {
      const controller = new TestResponseController();
      server.urls['/api/use-object'].response = {
        type: 'controlled-stream',
        controller,
      };

      controller.write('{"content": "h');
      await userEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('true');
      });
      await waitFor(() => {
        expect(screen.getByTestId('object')).toHaveTextContent(
          '{"content":"h"}',
        );
      });

      await userEvent.click(screen.getByTestId('clear-button'));

      await expect(controller.write('ello, world!"}')).rejects.toThrow();
      await expect(controller.close()).rejects.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
        expect(screen.getByTestId('error')).toBeEmptyDOMElement();
        expect(screen.getByTestId('object')).toBeEmptyDOMElement();
      });
    });

    describe('when the API returns a 404', () => {
      it('should render error', async () => {
        server.urls['/api/use-object'].response = {
          type: 'error',
          status: 404,
          body: 'Not found',
        };

        await userEvent.click(screen.getByTestId('submit-button'));

        await screen.findByTestId('error');
        expect(screen.getByTestId('error')).toHaveTextContent('Not found');
        expect(screen.getByTestId('on-error-result')).toHaveTextContent(
          'Not found',
        );
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });

    describe('onFinish', () => {
      it('should be called with an object when the stream finishes and the object matches the schema', async () => {
        server.urls['/api/use-object'].response = {
          type: 'stream-chunks',
          chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
        };

        await userEvent.click(screen.getByTestId('submit-button'));

        expect(screen.getByTestId('on-finish-calls')).toHaveTextContent(
          JSON.stringify([
            { object: { content: 'Hello, world!' }, error: undefined },
          ]),
        );
      });

      it('should be called with an error when the stream finishes and the object does not match the schema', async () => {
        server.urls['/api/use-object'].response = {
          type: 'stream-chunks',
          chunks: ['{ ', '"content-wrong": "Hello, ', 'world', '!"', '}'],
        };

        await userEvent.click(screen.getByTestId('submit-button'));

        expect(screen.getByTestId('on-finish-calls')).toHaveTextContent(
          'ZodError',
        );
      });
    });

    it('should clear the object state after a call to clear', async () => {
      server.urls['/api/use-object'].response = {
        type: 'stream-chunks',
        chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
      };

      await userEvent.click(screen.getByTestId('submit-button'));

      await screen.findByTestId('object');
      expect(screen.getByTestId('object')).toHaveTextContent(
        JSON.stringify({ content: 'Hello, world!' }),
      );

      await userEvent.click(screen.getByTestId('clear-button'));

      await waitFor(() => {
        expect(screen.getByTestId('object')).toBeEmptyDOMElement();
        expect(screen.getByTestId('error')).toBeEmptyDOMElement();
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });
  });

  describe('custom transport', () => {
    it.each([
      {
        name: 'a plain record',
        headers: {
          Authorization: 'Bearer TEST_TOKEN',
          'X-Custom-Header': 'CustomValue',
        },
      },
      {
        name: 'a Headers instance',
        headers: new Headers({
          Authorization: 'Bearer TEST_TOKEN',
          'X-Custom-Header': 'CustomValue',
        }),
      },
    ])('should send custom headers from $name', async ({ headers }) => {
      server.urls['/api/use-object'].response = {
        type: 'stream-chunks',
        chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
      };
      render(TestUseObjectCustomTransportComponent, {
        props: { headers },
      });

      await userEvent.click(screen.getByTestId('submit-button'));

      expect(server.calls[0].requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        authorization: 'Bearer TEST_TOKEN',
        'x-custom-header': 'CustomValue',
      });
    });

    it.each([
      {
        name: 'a plain record',
        headers: { 'Content-Type': 'text/plain' },
      },
      {
        name: 'a Headers instance',
        headers: new Headers({ 'Content-Type': 'text/plain' }),
      },
    ])(
      'should let custom headers from $name override the default content type',
      async ({ headers }) => {
        server.urls['/api/use-object'].response = {
          type: 'stream-chunks',
          chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
        };
        render(TestUseObjectCustomTransportComponent, {
          props: { headers },
        });

        await userEvent.click(screen.getByTestId('submit-button'));

        expect(server.calls[0].requestHeaders).toStrictEqual({
          'content-type': 'text/plain',
        });
      },
    );

    it('should send custom credentials', async () => {
      server.urls['/api/use-object'].response = {
        type: 'stream-chunks',
        chunks: ['{ ', '"content": "Authenticated ', 'content', '!"', '}'],
      };
      render(TestUseObjectCustomTransportComponent, {
        props: { credentials: 'include' },
      });

      await userEvent.click(screen.getByTestId('submit-button'));
      expect(server.calls[0].requestCredentials).toBe('include');
    });
  });
});

describe('cancellation', () => {
  it('stops a submission before its request starts', async () => {
    const fetch = vi.fn(async () => new Response('{"content":"unexpected"}'));
    const scope = effectScope();
    const result = scope.run(() =>
      useObject({
        api: '/api/use-object',
        schema: z.object({ content: z.string() }),
        fetch,
      }),
    )!;

    const request = result.submit('test-input') as unknown as Promise<void>;
    await result.stop();
    await request;

    expect(fetch).not.toHaveBeenCalled();
    expect(result.object.value).toBeUndefined();
    expect(result.isLoading.value).toBe(false);
    scope.stop();
  });

  it('stops a submission synchronously when loading starts', async () => {
    const fetch = vi.fn(async () => new Response('{"content":"unexpected"}'));
    let stopRequest: Promise<void> | undefined;
    const scope = effectScope();
    const result = scope.run(() => {
      const result = useObject({
        api: '/api/use-object',
        schema: z.object({ content: z.string() }),
        fetch,
      });

      watch(
        result.isLoading,
        isLoading => {
          if (isLoading) {
            stopRequest = result.stop() as unknown as Promise<void>;
          }
        },
        { flush: 'sync' },
      );

      return result;
    })!;

    const request = result.submit('test-input') as unknown as Promise<void>;
    await waitFor(() => expect(stopRequest).toBeDefined());
    await stopRequest;

    expect(result.isLoading.value).toBe(false);
    await request;
    expect(fetch).not.toHaveBeenCalled();
    expect(result.object.value).toBeUndefined();
    expect(result.isLoading.value).toBe(false);
    scope.stop();
  });

  it('keeps a newer submission stoppable when an older stream closes', async () => {
    const requests: Array<{
      controller: ReadableStreamDefaultController<Uint8Array>;
      signal: AbortSignal;
    }> = [];
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          requests.push({ controller, signal });
          signal.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          });
        },
      });
      return new Response(body);
    });
    const scope = effectScope();
    const result = scope.run(() =>
      useObject({
        api: '/api/use-object',
        schema: z.object({ content: z.string() }),
        fetch,
      }),
    )!;

    const firstSubmission = result.submit(
      'first-input',
    ) as unknown as Promise<void>;
    await waitFor(() => expect(requests).toHaveLength(1));

    const secondSubmission = result.submit(
      'second-input',
    ) as unknown as Promise<void>;
    requests[0].controller.close();
    await waitFor(() => expect(requests).toHaveLength(2));

    await result.stop();

    if (!requests[1].signal.aborted) {
      requests[1].controller.enqueue(
        new TextEncoder().encode('{"content":"unexpected"}'),
      );
      requests[1].controller.close();
    }

    await Promise.all([firstSubmission, secondSubmission]);
    expect(requests[1].signal.aborted).toBe(true);
    expect(result.object.value).toBeUndefined();
    expect(result.isLoading.value).toBe(false);
    scope.stop();
  });
});
