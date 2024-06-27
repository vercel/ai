import { mockFetchDataStream, mockFetchError } from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { SetupServer, setupServer } from 'msw/node';
import { z } from 'zod';
import { experimental_useObject } from './use-object';

describe('text stream', () => {
  const TestComponent = () => {
    const { object, error, submit, isLoading } = experimental_useObject({
      api: '/api/use-object',
      schema: z.object({ content: z.string() }),
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
      </div>
    );
  };

  beforeEach(() => {
    render(<TestComponent />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  describe("when the API returns 'Hello, world!'", () => {
    let mockFetch: ReturnType<typeof mockFetchDataStream>;

    beforeEach(async () => {
      mockFetch = mockFetchDataStream({
        url: 'https://example.com/api/use-object',
        chunks: ['{ ', '"content": "Hello, ', 'world', '!"'],
      });

      await userEvent.click(screen.getByTestId('submit-button'));
    });

    it('should render stream', async () => {
      await screen.findByTestId('object');
      expect(screen.getByTestId('object')).toHaveTextContent(
        JSON.stringify({ content: 'Hello, world!' }),
      );
    });

    it("should send 'test' to the API", async () => {
      expect(await mockFetch.requestBody).toBe(JSON.stringify('test-input'));
    });

    it('should not have an error', async () => {
      await screen.findByTestId('error');
      expect(screen.getByTestId('error')).toBeEmptyDOMElement();
    });
  });

  describe('isLoading', async () => {
    let streamController: ReadableStreamDefaultController<string>;
    let server: SetupServer;

    beforeEach(() => {
      const stream = new ReadableStream({
        start(controller) {
          streamController = controller;
        },
      });

      server = setupServer(
        http.post('https://example.com/api/use-object', ({ request }) => {
          return new HttpResponse(stream.pipeThrough(new TextEncoderStream()), {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          });
        }),
      );

      server.listen();
    });

    afterEach(() => {
      server.close();
    });

    it('should be true when loading', async () => {
      streamController.enqueue('{"content": ');

      userEvent.click(screen.getByTestId('submit-button'));

      // wait for element "loading" to have text content "true":
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('true');
      });

      streamController.enqueue('"Hello, world!"}');
      streamController.close();

      // wait for element "loading" to have text content "false":
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('true');
      });
    });
  });

  describe('when the API returns a 404', () => {
    beforeEach(async () => {
      mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

      await userEvent.click(screen.getByTestId('submit-button'));
    });

    it('should render error', async () => {
      await screen.findByTestId('error');
      expect(screen.getByTestId('error')).toHaveTextContent('Error: Not found');
    });
  });
});
