import { mockFetchDataStream } from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { experimental_useObject } from './use-object';

describe('text stream', () => {
  const TestComponent = () => {
    const { object, setInput } = experimental_useObject({
      api: '/api/use-object',
      schema: z.object({ content: z.string() }),
    });

    return (
      <div>
        <div data-testid="object">{JSON.stringify(object)}</div>
        <button
          data-testid="submit-button"
          onClick={async () => setInput('test')}
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

  it('should render stream', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/use-object',
      chunks: ['{ ', '"content": "Hello, ', 'world', '!"'],
    });

    await userEvent.click(screen.getByTestId('submit-button'));

    await screen.findByTestId('object');
    expect(screen.getByTestId('object')).toHaveTextContent(
      JSON.stringify({ content: 'Hello, world!' }),
    );
  });
});
