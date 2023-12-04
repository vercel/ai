import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
  mockFetchTextStream,
} from '../tests/utils/mock-fetch';
import { useCompletion } from './use-completion';

const TestComponent = () => {
  const {
    completion,
    handleSubmit,
    error,
    handleInputChange,
    input,
    isLoading,
  } = useCompletion();

  return (
    <div>
      <div data-testid="loading">{isLoading.toString()}</div>
      {error && <div data-testid="error">{error.toString()}</div>}
      {completion && <div data-testid="completion">{completion}</div>}
      <form onSubmit={handleSubmit}>
        <input
          data-testid="input"
          value={input}
          placeholder="Say something..."
          onChange={handleInputChange}
        />
      </form>
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

test('Shows streamed complex normal response', async () => {
  mockFetchTextStream({
    url: 'https://example.com/api/completion',
    chunks: ['Hello', ',', ' world', '.'],
  });

  await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

  await screen.findByTestId('completion');
  expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
});

test('Shows streamed complex text response', async () => {
  mockFetchDataStream({
    url: 'https://example.com/api/completion',
    chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
  });

  await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

  await screen.findByTestId('completion');
  expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
});

describe('loading state', () => {
  test('should show loading state', async () => {
    let finishGeneration: ((value?: unknown) => void) | undefined;
    const finishGenerationPromise = new Promise(resolve => {
      finishGeneration = resolve;
    });

    mockFetchDataStreamWithGenerator({
      url: 'https://example.com/api/chat',
      chunkGenerator: (async function* generate() {
        const encoder = new TextEncoder();
        yield encoder.encode('0:"Hello"\n');
        await finishGenerationPromise;
      })(),
    });

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('loading');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    finishGeneration?.();

    await screen.findByTestId('loading');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  test('should reset loading state on error', async () => {
    mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('loading');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });
});
