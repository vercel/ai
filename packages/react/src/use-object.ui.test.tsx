import { mockFetchDataStream, mockFetchError } from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { experimental_useObject } from './use-object';

describe('text stream', () => {
  const TestComponent = () => {
    const { object, error, setInput } = experimental_useObject({
      api: '/api/use-object',
      schema: z.object({ content: z.string() }),
    });

    return (
      <div>
        <div data-testid="object">{JSON.stringify(object)}</div>
        <div data-testid="error">{error?.toString()}</div>
        <button
          data-testid="submit-button"
          onClick={async () => setInput('test-input')}
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
