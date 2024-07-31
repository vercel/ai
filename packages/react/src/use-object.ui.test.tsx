import {
  describeWithTestServer,
  withTestServer,
} from '@ai-sdk/provider-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { experimental_useObject } from './use-object';

describe('text stream', () => {
  let onErrorResult: Error | undefined;
  let onFinishCalls: Array<{
    object: { content: string } | undefined;
    error: Error | undefined;
  }> = [];

  const TestComponent = () => {
    const { object, error, submit, isLoading, stop } = experimental_useObject({
      api: '/api/use-object',
      schema: z.object({ content: z.string() }),
      onError(error) {
        onErrorResult = error;
      },
      onFinish(event) {
        onFinishCalls.push(event);
      },
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
      </div>
    );
  };

  beforeEach(() => {
    render(<TestComponent />);
    onErrorResult = undefined;
    onFinishCalls = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    onErrorResult = undefined;
    onFinishCalls = [];
  });

  describeWithTestServer(
    "when the API returns 'Hello, world!'",
    {
      url: '/api/use-object',
      type: 'stream-values',
      content: ['{ ', '"content": "Hello, ', 'world', '!"'],
    },
    ({ call }) => {
      beforeEach(async () => {
        await userEvent.click(screen.getByTestId('submit-button'));
      });

      it('should render stream', async () => {
        await screen.findByTestId('object');
        expect(screen.getByTestId('object')).toHaveTextContent(
          JSON.stringify({ content: 'Hello, world!' }),
        );
      });

      it("should send 'test' to the API", async () => {
        expect(await call(0).getRequestBodyJson()).toBe('test-input');
      });

      it('should not have an error', async () => {
        await screen.findByTestId('error');
        expect(screen.getByTestId('error')).toBeEmptyDOMElement();
        expect(onErrorResult).toBeUndefined();
      });
    },
  );

  describe('isLoading', async () => {
    it(
      'should be true while loading',
      withTestServer(
        { url: '/api/use-object', type: 'controlled-stream' },
        async ({ streamController }) => {
          streamController.enqueue('{"content": ');

          await userEvent.click(screen.getByTestId('submit-button'));

          // wait for element "loading" to have text content "true":
          await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('true');
          });

          streamController.enqueue('"Hello, world!"}');
          streamController.close();

          // wait for element "loading" to have text content "false":
          await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('false');
          });
        },
      ),
    );
  });

  describe('stop', async () => {
    it(
      'should abort the stream and not consume any more data',
      withTestServer(
        { url: '/api/use-object', type: 'controlled-stream' },
        async ({ streamController }) => {
          streamController.enqueue('{"content": "h');

          userEvent.click(screen.getByTestId('submit-button'));

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
          streamController.enqueue('ello, world!"}');
          streamController.close();

          // should only show start of object:
          expect(screen.getByTestId('object')).toHaveTextContent(
            '{"content":"h"}',
          );
        },
      ),
    );
  });

  describe('when the API returns a 404', () => {
    it(
      'should render error',
      withTestServer(
        {
          url: '/api/use-object',
          type: 'error',
          status: 404,
          content: 'Not found',
        },
        async () => {
          await userEvent.click(screen.getByTestId('submit-button'));

          await screen.findByTestId('error');
          expect(screen.getByTestId('error')).toHaveTextContent('Not found');
          expect(onErrorResult).toBeInstanceOf(Error);
        },
      ),
    );
  });

  describe('onFinish', () => {
    it(
      'should be called with an object when the stream finishes and the object matches the schema',
      withTestServer(
        {
          url: '/api/use-object',
          type: 'stream-values',
          content: ['{ ', '"content": "Hello, ', 'world', '!"', '}'],
        },
        async () => {
          await userEvent.click(screen.getByTestId('submit-button'));

          expect(onFinishCalls).toStrictEqual([
            { object: { content: 'Hello, world!' }, error: undefined },
          ]);
        },
      ),
    );
  });

  it(
    'should be called with an error when the stream finishes and the object does not match the schema',
    withTestServer(
      {
        url: '/api/use-object',
        type: 'stream-values',
        content: ['{ ', '"content-wrong": "Hello, ', 'world', '!"', '}'],
      },
      async () => {
        await userEvent.click(screen.getByTestId('submit-button'));

        expect(onFinishCalls).toStrictEqual([
          { object: undefined, error: expect.any(Error) },
        ]);
      },
    ),
  );
});
