import {
  mockFetchDataStream,
  mockFetchDataStreamWithGenerator,
  mockFetchError,
} from '@ai-sdk/ui-utils/test';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { findByText, screen } from '@testing-library/vue';
import TestCompletionComponent from './TestCompletionComponent.vue';
import TestCompletionTextStreamComponent from './TestCompletionTextStreamComponent.vue';
import { setupTestComponent } from './setup-test-component';

describe('stream data stream', () => {
  setupTestComponent(TestCompletionComponent);

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/completion',
      chunks: ['0:"Hello"\n', '0:","\n', '0:" world"\n', '0:"."\n'],
    });

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
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

      await findByText(await screen.findByTestId('loading'), 'false');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('should reset loading state on error', async () => {
      mockFetchError({ statusCode: 404, errorMessage: 'Not found' });

      await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });
});

describe('stream data stream', () => {
  setupTestComponent(TestCompletionTextStreamComponent);

  it('should show streamed response', async () => {
    mockFetchDataStream({
      url: 'https://example.com/api/completion',
      chunks: ['Hello', ',', ' world', '.'],
    });

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });
});
