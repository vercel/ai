import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod/v4';
import { experimental_useObject } from './use-object';

const server = createTestServer({
  '/api/use-object': {},
});

describe('text stream', () => {
  let onErrorResult: Error | undefined;
  let onFinishCalls: Array<{
    object: { content: string } | undefined;
    error: Error | undefined;
  }> = [];

  const TestComponent = ({
    headers,
    credentials,
  }: {
    headers?: Record<string, string> | Headers;
    credentials?: RequestCredentials;
  }) => {
    const { object, error, submit, isLoading, stop, clear } =
      experimental_useObject({
        api: '/api/use-object',
        schema: z.object({ content: z.string() }),
        onError(error) {
          onErrorResult = error;
        },
        onFinish(event) {
          onFinishCalls.push(event);
        },
        headers,
        credentials,
      });

    return (
      <div>
        <div data-testid="loading">{isLoading.toString()}</div>
        <div data-testid="object">{JSON.stringify(object)}</div>
        <div data-testid="error">{error?.toString()}</div>
        <button
          data-testid="submit-button"
          onClick={() => submit('test-input')}
        >
          Generate
        </button>
        <button data-testid="stop-button" onClick={stop}>
          Stop
        </button>
        <button data-testid="clear-button" onClick={clear}>
          Clear
        </button>
      </div>
    );
  };

  beforeEach(() => {
    onErrorResult = undefined;
    onFinishCalls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    onErrorResult = undefined;
    onFinishCalls = [];
  });

  describe('basic component', () => {
    beforeEach(() => {
      render(<TestComponent />);
    });

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
        expect(onErrorResult).toBeUndefined();
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
        expect(onErrorResult).toBeInstanceOf(Error);
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

        expect(onFinishCalls).toStrictEqual([
          { object: { content: 'Hello, world!' }, error: undefined },
        ]);
      });

      it('should be called with an error when the stream finishes and the object does not match the schema', async () => {
        server.urls['/api/use-object'].response = {
          type: 'stream-chunks',
          chunks: ['{ ', '"content-wrong": "Hello, ', 'world', '!"', '}'],
        };

        await userEvent.click(screen.getByTestId('submit-button'));

        expect(onFinishCalls).toStrictEqual([
          { object: undefined, error: expect.any(Error) },
        ]);
      });
    });
  });

  it('should send custom headers', async () => {
    server.urls['/api/use-object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
    };

    render(
      <TestComponent
        headers={{
          Authorization: 'Bearer TEST_TOKEN',
          'X-Custom-Header': 'CustomValue',
        }}
      />,
    );

    await userEvent.click(screen.getByTestId('submit-button'));

    expect(server.calls[0].requestHeaders).toStrictEqual({
      'content-type': 'application/json',
      authorization: 'Bearer TEST_TOKEN',
      'x-custom-header': 'CustomValue',
    });
  });

  it('should send custom credentials', async () => {
    server.urls['/api/use-object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Authenticated ', 'content', '!"', '}'],
    };

    render(<TestComponent credentials="include" />);
    await userEvent.click(screen.getByTestId('submit-button'));
    expect(server.calls[0].requestCredentials).toBe('include');
  });

  it('should clear the object state after a call to clear', async () => {
    server.urls['/api/use-object'].response = {
      type: 'stream-chunks',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
    };

    render(<TestComponent />);
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
