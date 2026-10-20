import {
  createTestServer,
  TestResponseController,
} from '@ai-sdk/test-server/with-vitest';
import userEvent from '@testing-library/user-event';
import { findByText, screen, waitFor } from '@testing-library/vue';
import type { UIMessageChunk } from 'ai';
import { effectScope } from 'vue';
import TestCompletionComponent from './TestCompletionComponent.vue';
import TestCompletionTextStreamComponent from './TestCompletionTextStreamComponent.vue';
import { setupTestComponent } from './setup-test-component';
import { useCompletion } from './use-completion';
import { describe, it, expect } from 'vitest';

function formatChunk(part: UIMessageChunk) {
  return `data: ${JSON.stringify(part)}\n\n`;
}

const server = createTestServer({
  '/api/completion': {},
});

describe('initial completion', () => {
  it('allows the completion to be cleared', async () => {
    const scope = effectScope();
    const { completion, setCompletion } = scope.run(() =>
      useCompletion({
        id: 'clear-initial-completion',
        initialCompletion: 'Previous completion',
      }),
    )!;

    await waitFor(() => {
      expect(completion.value).toBe('Previous completion');
    });

    setCompletion('');

    await waitFor(() => {
      expect(completion.value).toBe('');
    });

    scope.stop();
  });

  it('preserves a cleared completion when reusing an id', async () => {
    const scope = effectScope();
    const first = scope.run(() =>
      useCompletion({
        id: 'reuse-cleared-initial-completion',
        initialCompletion: 'Previous completion',
      }),
    )!;

    await waitFor(() => {
      expect(first.completion.value).toBe('Previous completion');
    });

    first.setCompletion('');

    await waitFor(() => {
      expect(first.completion.value).toBe('');
    });

    const second = scope.run(() =>
      useCompletion({
        id: 'reuse-cleared-initial-completion',
        initialCompletion: 'Different initial completion',
      }),
    )!;

    expect(second.completion.value).toBe('');
    scope.stop();
  });

  it('shows an empty completion while a request is pending', async () => {
    let releaseResponse!: () => void;
    const responseGate = new Promise<void>(resolve => {
      releaseResponse = resolve;
    });
    const scope = effectScope();
    const { completion, complete } = scope.run(() =>
      useCompletion({
        id: 'clear-initial-completion-on-request',
        initialCompletion: 'Previous completion',
        streamProtocol: 'text',
        fetch: async () => {
          await responseGate;
          return new Response('');
        },
      }),
    )!;

    await waitFor(() => {
      expect(completion.value).toBe('Previous completion');
    });

    const request = complete('New prompt');

    await waitFor(() => {
      expect(completion.value).toBe('');
    });

    releaseResponse();
    await request;
    scope.stop();
  });

  it('preserves an empty completion response', async () => {
    const scope = effectScope();
    const { completion, complete } = scope.run(() =>
      useCompletion({
        id: 'empty-completion-response',
        initialCompletion: 'Previous completion',
        streamProtocol: 'text',
        fetch: async () => new Response(''),
      }),
    )!;

    await waitFor(() => {
      expect(completion.value).toBe('Previous completion');
    });

    await complete('New prompt');

    await waitFor(() => {
      expect(completion.value).toBe('');
    });

    scope.stop();
  });
});

describe('stream data stream', () => {
  setupTestComponent(TestCompletionComponent);

  it('should show streamed response', async () => {
    server.urls['/api/completion'].response = {
      type: 'stream-chunks',
      chunks: [
        formatChunk({ type: 'text-start', id: '0' }),
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ',' }),
        formatChunk({ type: 'text-delta', id: '0', delta: ' world' }),
        formatChunk({ type: 'text-delta', id: '0', delta: '.' }),
        formatChunk({ type: 'text-end', id: '0' }),
      ],
    };

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });

  describe('loading state', () => {
    it('should show loading state', async () => {
      const controller = new TestResponseController();
      server.urls['/api/completion'].response = {
        type: 'controlled-stream',
        controller,
      };

      await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      controller.write(formatChunk({ type: 'text-start', id: '0' }));
      controller.write(
        formatChunk({ type: 'text-delta', id: '0', delta: 'Hello' }),
      );
      controller.write(formatChunk({ type: 'text-end', id: '0' }));
      controller.close();

      await findByText(await screen.findByTestId('loading'), 'false');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('should reset loading state on error', async () => {
      server.urls['/api/completion'].response = {
        type: 'error',
        status: 404,
        body: 'Not found',
      };

      await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

      await screen.findByTestId('loading');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });
});

describe('stream data stream', () => {
  setupTestComponent(TestCompletionTextStreamComponent);

  it('should show streamed response', async () => {
    server.urls['/api/completion'].response = {
      type: 'stream-chunks',
      chunks: ['Hello', ',', ' world', '.'],
    };

    await userEvent.type(screen.getByTestId('input'), 'hi{enter}');

    await screen.findByTestId('completion');
    expect(screen.getByTestId('completion')).toHaveTextContent('Hello, world.');
  });
});
